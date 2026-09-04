from __future__ import annotations

import random

from PIL import Image, ImageEnhance, ImageFilter


def phone_photo_augmentation(image: Image.Image) -> Image.Image:
    """Approximate common phone-photo defects without changing equation content."""
    image = image.convert("RGB")
    background = Image.new(
        "RGB",
        (image.width + random.randint(20, 100), image.height + random.randint(20, 100)),
        tuple(random.randint(225, 255) for _ in range(3)),
    )
    x = random.randint(10, background.width - image.width - 10)
    y = random.randint(10, background.height - image.height - 10)
    background.paste(image, (x, y))
    image = background.rotate(
        random.uniform(-3.0, 3.0),
        resample=Image.Resampling.BICUBIC,
        expand=True,
        fillcolor=tuple(random.randint(225, 255) for _ in range(3)),
    )
    image = ImageEnhance.Brightness(image).enhance(random.uniform(0.82, 1.12))
    image = ImageEnhance.Contrast(image).enhance(random.uniform(0.75, 1.25))
    if random.random() < 0.3:
        image = image.filter(ImageFilter.GaussianBlur(random.uniform(0.1, 0.8)))
    return image
