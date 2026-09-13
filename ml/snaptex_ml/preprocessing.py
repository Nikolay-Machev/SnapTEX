from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import re

import numpy as np
from PIL import Image, ImageFilter, ImageOps

Bounds = tuple[int, int, int, int]
NormalizedCrop = tuple[float, float, float, float]


@dataclass(frozen=True)
class PreparedImage:
    image: Image.Image
    localization: str

    @property
    def ink_crop_applied(self) -> bool:
        return self.localization != "full-frame"


def _padded_bounds(image: Image.Image, bounds: Bounds) -> Bounds:
    left, top, right, bottom = bounds
    width, height = right - left, bottom - top
    horizontal_padding = max(20, int(width * 0.12))
    vertical_padding = max(20, int(height * 0.30))
    return (
        max(0, left - horizontal_padding),
        max(0, top - vertical_padding),
        min(image.width, right + horizontal_padding + 1),
        min(image.height, bottom + vertical_padding + 1),
    )


def _blue_ink_bounds(image: Image.Image) -> Bounds | None:
    pixels = np.asarray(image, dtype=np.int16)
    red, green, blue = (pixels[:, :, channel] for channel in range(3))
    mask = (blue - red > 18) & (blue - green > 5) & (blue < 210)
    rows, columns = np.where(mask)
    minimum_pixels = max(20, int(image.width * image.height * 0.00002))
    if len(columns) < minimum_pixels:
        return None
    bounds = (int(columns.min()), int(rows.min()), int(columns.max()), int(rows.max()))
    if bounds[2] - bounds[0] < 5 or bounds[3] - bounds[1] < 5:
        return None
    return _padded_bounds(image, bounds)


def _groups(indices: np.ndarray, maximum_gap: int) -> list[tuple[int, int]]:
    if not len(indices):
        return []
    groups: list[tuple[int, int]] = []
    start = previous = int(indices[0])
    for raw_index in indices[1:]:
        index = int(raw_index)
        if index - previous > maximum_gap:
            groups.append((start, previous))
            start = index
        previous = index
    groups.append((start, previous))
    return groups


def _contrast_bounds(image: Image.Image) -> Bounds | None:
    """Locate dark strokes relative to their local page background."""
    gray_image = ImageOps.grayscale(image)
    radius = max(3, min(image.size) // 80)
    background = gray_image.filter(ImageFilter.GaussianBlur(radius=radius))
    gray = np.asarray(gray_image, dtype=np.int16)
    residual = np.asarray(background, dtype=np.int16) - gray
    threshold = max(10, int(np.percentile(residual, 96)))
    mask = residual > threshold

    mask[mask.sum(axis=1) > image.width * 0.45, :] = False
    mask[:, mask.sum(axis=0) > image.height * 0.45] = False
    border_x, border_y = max(2, image.width // 100), max(2, image.height // 100)
    mask[:border_y, :] = mask[-border_y:, :] = False
    mask[:, :border_x] = mask[:, -border_x:] = False

    row_counts = mask.sum(axis=1)
    active_rows = np.where(row_counts >= max(2, image.width * 0.002))[0]
    candidates: list[tuple[float, Bounds]] = []
    for top, bottom in _groups(active_rows, max(4, image.height // 80)):
        band = mask[top : bottom + 1]
        rows, columns = np.where(band)
        if len(columns) < max(20, image.width * image.height * 0.00002):
            continue
        left, right = int(columns.min()), int(columns.max())
        width, height = right - left + 1, bottom - top + 1
        if width < 12 or height < 5 or height > image.height * 0.45:
            continue
        density = len(columns) / max(width * height, 1)
        aspect_bonus = min(width / max(height, 1), 6.0)
        center_y = (top + bottom) / 2 / image.height
        centrality = 1.0 - min(abs(center_y - 0.45), 0.45)
        score = len(columns) * (1 + density) * (1 + aspect_bonus / 8) * centrality
        candidates.append((score, (left, top, right, bottom)))

    if not candidates:
        return None
    return _padded_bounds(image, max(candidates, key=lambda item: item[0])[1])


def _manual_bounds(image: Image.Image, crop: NormalizedCrop) -> Bounds:
    x, y, width, height = crop
    if not all(np.isfinite(value) for value in crop):
        raise ValueError("Crop coordinates must be finite.")
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        raise ValueError("Crop coordinates are outside the image.")
    if x + width > 1.000001 or y + height > 1.000001:
        raise ValueError("Crop coordinates are outside the image.")
    left, top = round(x * image.width), round(y * image.height)
    right, bottom = round((x + width) * image.width), round((y + height) * image.height)
    if right - left < 8 or bottom - top < 8:
        raise ValueError("The selected crop is too small.")
    return left, top, right, bottom


def prepare_equation_image(
    image_bytes: bytes, crop: NormalizedCrop | None = None
) -> PreparedImage:
    with Image.open(BytesIO(image_bytes)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")

    if crop is not None:
        bounds, localization = _manual_bounds(image, crop), "manual"
    else:
        bounds = _blue_ink_bounds(image)
        localization = "blue-ink"
        if bounds is None:
            bounds = _contrast_bounds(image)
            localization = "local-contrast"

    if bounds is None:
        return PreparedImage(ImageOps.autocontrast(image, cutoff=1), "full-frame")

    equation = ImageOps.grayscale(image.crop(bounds))
    equation = ImageOps.autocontrast(equation, cutoff=1).convert("RGB")
    return PreparedImage(equation, localization)


def validate_latex(latex: str) -> str:
    value = latex.strip()
    if not value:
        raise ValueError("The model returned an empty transcription.")
    if len(value) > 2048:
        raise ValueError("The model returned an excessively long transcription.")
    if re.search(r"(.)\1{23,}", value):
        raise ValueError("The model returned a pathological token repetition.")

    depth = 0
    for index, character in enumerate(value):
        escaped = index > 0 and value[index - 1] == "\\"
        if character == "{" and not escaped:
            depth += 1
        elif character == "}" and not escaped:
            depth -= 1
            if depth < 0:
                raise ValueError("The model returned unbalanced LaTeX braces.")
    if depth:
        raise ValueError("The model returned unbalanced LaTeX braces.")
    return value
