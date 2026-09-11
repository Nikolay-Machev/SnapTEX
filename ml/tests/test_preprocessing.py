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


def test_preserves_full_frame_when_blue_ink_is_not_detected() -> None:
    image = Image.new("RGB", (320, 180), "white")
    ImageDraw.Draw(image).text((80, 70), "E = mc2", fill="black")

    prepared = prepare_equation_image(image_bytes(image))

    assert prepared.ink_crop_applied is False
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
