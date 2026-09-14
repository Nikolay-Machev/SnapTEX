from __future__ import annotations

import random
from io import BytesIO

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def _paper_background(size: tuple[int, int], rng: random.Random) -> Image.Image:
    base = tuple(rng.randint(220, 255) for _ in range(3))
    paper = Image.new("RGB", size, base)
    draw = ImageDraw.Draw(paper, "RGBA")
    if rng.random() < 0.45:
        spacing = rng.randint(24, 48)
        line_color = (80, 145, 205, rng.randint(25, 70))
        for y in range(rng.randint(5, spacing), size[1], spacing):
            draw.line((0, y, size[0], y), fill=line_color, width=rng.randint(1, 2))
    return paper


def _lighting_gradient(image: Image.Image, rng: random.Random) -> Image.Image:
    overlay = Image.new("L", image.size)
    pixels = overlay.load()
    horizontal = rng.random() < 0.5
    start, end = rng.randint(135, 255), rng.randint(185, 255)
    denominator = max((image.width if horizontal else image.height) - 1, 1)
    for y in range(image.height):
        for x in range(image.width):
            position = x if horizontal else y
            pixels[x, y] = round(start + (end - start) * position / denominator)
    return Image.composite(image, Image.new("RGB", image.size, "black"), overlay)


def phone_photo_augmentation(
    image: Image.Image, *, rng: random.Random | None = None
) -> Image.Image:
    """Approximate common phone-photo defects without changing equation content."""
    rng = rng or random.Random()
    source = ImageOps.grayscale(image)
    if rng.random() < 0.35:
        source = ImageEnhance.Contrast(source).enhance(rng.uniform(0.35, 0.75))
    horizontal_margin, vertical_margin = rng.randint(24, 140), rng.randint(24, 110)
    background = _paper_background(
        (source.width + horizontal_margin, source.height + vertical_margin), rng
    )
    ink_mask = ImageOps.invert(source)
    ink_color = rng.choice(
        [(20, 20, 20), (55, 55, 55), (25, 55, 125), (30, 75, 120)]
    )
    ink_layer = Image.new("RGB", source.size, ink_color)
    x = rng.randint(8, background.width - source.width - 8)
    y = rng.randint(8, background.height - source.height - 8)
    background.paste(ink_layer, (x, y), ink_mask)
    image = background.rotate(
        rng.uniform(-5.0, 5.0),
        resample=Image.Resampling.BICUBIC,
        expand=True,
        fillcolor=tuple(rng.randint(220, 255) for _ in range(3)),
    )
    if rng.random() < 0.65:
        image = _lighting_gradient(image, rng)
    image = ImageEnhance.Brightness(image).enhance(rng.uniform(0.72, 1.15))
    image = ImageEnhance.Contrast(image).enhance(rng.uniform(0.60, 1.35))
    if rng.random() < 0.45:
        image = image.filter(ImageFilter.GaussianBlur(rng.uniform(0.15, 1.2)))
    if rng.random() < 0.35:
        width, height = image.size
        inset_x = rng.randint(0, max(1, width // 30))
        inset_y = rng.randint(0, max(1, height // 20))
        image = image.crop((inset_x, inset_y, width, height))
    if rng.random() < 0.45:
        buffer = BytesIO()
        image.save(buffer, "JPEG", quality=rng.randint(35, 88))
        buffer.seek(0)
        with Image.open(buffer) as compressed:
            image = compressed.convert("RGB")
    return image
