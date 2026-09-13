from io import BytesIO

from PIL import Image, ImageDraw
import pytest

from snaptex_ml.preprocessing import prepare_equation_image, validate_latex


def image_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_tightly_crops_blue_handwriting_and_converts_to_grayscale() -> None:
    image = Image.new("RGB", (1000, 800), "white")
    draw = ImageDraw.Draw(image)
    draw.line((400, 350, 600, 350), fill=(25, 55, 130), width=8)
    draw.line((500, 315, 500, 385), fill=(25, 55, 130), width=8)

    prepared = prepare_equation_image(image_bytes(image))

    assert prepared.ink_crop_applied is True
    assert prepared.image.mode == "RGB"
    assert prepared.image.width < image.width // 2
    assert prepared.image.height < image.height // 2


@pytest.mark.parametrize(
    ("background", "ink"),
    [
        ((255, 255, 255), (10, 10, 10)),
        ((244, 231, 190), (65, 65, 65)),
        ((220, 240, 225), (35, 35, 35)),
    ],
)
def test_localizes_color_independent_equations(background, ink) -> None:
    image = Image.new("RGB", (640, 420), background)
    draw = ImageDraw.Draw(image)
    draw.text((210, 190), "E = mc2 + x/2", fill=ink, stroke_width=1)

    prepared = prepare_equation_image(image_bytes(image))

    assert prepared.localization == "local-contrast"
    assert prepared.image.width < image.width
    assert prepared.image.height < image.height // 2


def test_suppresses_ruled_paper_lines_when_localizing() -> None:
    image = Image.new("RGB", (700, 500), (250, 245, 220))
    draw = ImageDraw.Draw(image)
    for y in range(40, 500, 40):
        draw.line((0, y, 699, y), fill=(130, 180, 215), width=2)
    draw.text((180, 230), "integral f(x) dx", fill=(25, 25, 25), stroke_width=1)

    prepared = prepare_equation_image(image_bytes(image))

    assert prepared.localization == "local-contrast"
    assert prepared.image.height < image.height // 2


def test_manual_crop_has_priority_over_automatic_localization() -> None:
    image = Image.new("RGB", (1000, 600), "white")
    draw = ImageDraw.Draw(image)
    draw.text((100, 100), "wrong", fill="blue")
    draw.text((600, 350), "x = 2", fill="black")

    prepared = prepare_equation_image(image_bytes(image), (0.5, 0.5, 0.4, 0.3))

    assert prepared.localization == "manual"
    assert prepared.image.size == (400, 180)


def test_preserves_blank_full_frame() -> None:
    image = Image.new("RGB", (320, 180), "white")
    prepared = prepare_equation_image(image_bytes(image))
    assert prepared.localization == "full-frame"
    assert prepared.image.size == image.size


@pytest.mark.parametrize(
    "latex",
    [r"\\frac{a}{b", r"a}", "w" * 30, ""],
)
def test_rejects_structurally_invalid_model_output(latex: str) -> None:
    with pytest.raises(ValueError):
        validate_latex(latex)


def test_accepts_balanced_latex_and_visible_escaped_braces() -> None:
    assert validate_latex(r" \\{x\\} = \\frac{1}{2} ") == r"\\{x\\} = \\frac{1}{2}"
