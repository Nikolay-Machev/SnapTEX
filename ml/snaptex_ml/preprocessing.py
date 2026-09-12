from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import re

import numpy as np
from PIL import Image, ImageOps


@dataclass(frozen=True)
class PreparedImage:
    image: Image.Image
    ink_crop_applied: bool


def _blue_ink_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    pixels = np.asarray(image, dtype=np.int16)
    red, green, blue = (pixels[:, :, channel] for channel in range(3))
    mask = (blue - red > 18) & (blue - green > 5) & (blue < 210)
    rows, columns = np.where(mask)
    minimum_pixels = max(20, int(image.width * image.height * 0.00002))
    if len(columns) < minimum_pixels:
        return None

    left, right = int(columns.min()), int(columns.max())
    top, bottom = int(rows.min()), int(rows.max())
    if right - left < 5 or bottom - top < 5:
        return None

    horizontal_padding = max(25, int((right - left) * 0.12))
    vertical_padding = max(25, int((bottom - top) * 0.30))
    return (
        max(0, left - horizontal_padding),
        max(0, top - vertical_padding),
        min(image.width, right + horizontal_padding + 1),
        min(image.height, bottom + vertical_padding + 1),
    )


def prepare_equation_image(image_bytes: bytes) -> PreparedImage:
    with Image.open(BytesIO(image_bytes)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")

    bounds = _blue_ink_bounds(image)
    if bounds is None:
        # Preserve the established behavior for typed, pencil, and black-ink
        # inputs until a color-independent detector has been validated.
        return PreparedImage(ImageOps.autocontrast(image, cutoff=1), False)

    equation = ImageOps.grayscale(image.crop(bounds))
    equation = ImageOps.autocontrast(equation, cutoff=1).convert("RGB")
    return PreparedImage(equation, True)


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
