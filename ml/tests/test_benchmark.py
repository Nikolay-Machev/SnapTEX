from io import BytesIO
import json

from PIL import Image

from snaptex_ml.benchmark import (
    Fixture,
    ModelResult,
    character_error_rate,
    evaluate_model,
    load_fixtures,
    normalize_latex,
    rank_results,
)


class StubRecognizer:
    model_id = "stub"

    def __init__(self, result: str = r"E=mc^{2}") -> None:
        self.result = result
        self.crops = []

    def recognize(self, image_bytes: bytes, crop=None) -> str:
        self.crops.append(crop)
        return self.result


def write_image(path) -> None:
    image = Image.new("RGB", (32, 32), "white")
    output = BytesIO()
    image.save(output, format="JPEG")
    path.write_bytes(output.getvalue())


def test_python_metrics_match_typescript_semantic_normalization() -> None:
    assert normalize_latex(r"$ \left( x + 1 \right) $") == "(x+1)"
    assert character_error_rate("E = mc^2", r"E=mc^{2}") == 0
    assert character_error_rate("x^2", "x_2") == 1 / 3


def test_loads_normalized_crop_from_manifest(tmp_path) -> None:
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            [
                {
                    "file": "equation.jpeg",
                    "expectedLatex": "x=1",
                    "crop": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4},
                }
            ]
        )
    )

    fixtures = load_fixtures(manifest)

    assert fixtures[0].crop == (0.1, 0.2, 0.3, 0.4)


def test_evaluates_manual_crop_and_equivalent_latex(tmp_path) -> None:
    write_image(tmp_path / "equation.jpeg")
    recognizer = StubRecognizer()
    crop = (0.1, 0.2, 0.3, 0.4)

    result = evaluate_model(
        recognizer,
        [Fixture("equation.jpeg", "E = mc^2", crop)],
        tmp_path,
        "manual",
    )

    assert result.average_cer == 0
    assert result.exact_matches == 1
    assert result.error_count == 0
    assert recognizer.crops == [crop]


def test_records_model_failure_without_ending_benchmark(tmp_path) -> None:
    write_image(tmp_path / "equation.jpeg")
    recognizer = StubRecognizer()

    def fail(*_args, **_kwargs):
        raise ValueError("generation failed")

    recognizer.recognize = fail
    result = evaluate_model(
        recognizer,
        [Fixture("equation.jpeg", "x=1")],
        tmp_path,
        "automatic",
    )

    assert result.average_cer == 1
    assert result.error_count == 1
    assert result.results[0].error == "generation failed"


def test_ranks_lower_cer_first() -> None:
    slower_better = ModelResult("better", "automatic", 0.2, 1, 0, 2.0, [])
    faster_worse = ModelResult("worse", "automatic", 0.3, 2, 0, 0.1, [])

    assert rank_results([faster_worse, slower_better])[0].model == "better"
