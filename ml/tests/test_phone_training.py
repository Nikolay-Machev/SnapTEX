import json

from snaptex_ml.model import InvalidModelOutput

import evaluate_checkpoint
from prepare_phone_training import split_pages


def test_page_split_keeps_all_blocks_on_the_same_page():
    pages = [f"phone-{number:04d}" for number in range(1, 101)]
    splits = split_pages(pages, 20260926, validation_pages=10, test_pages=20)
    assert splits == split_pages(list(reversed(pages)), 20260926, 10, 20)
    assert {name: list(splits.values()).count(name) for name in
            ("train", "validation", "test")} == {
        "train": 70, "validation": 10, "test": 20,
    }


def test_checkpoint_evaluation_counts_rejected_predictions(tmp_path, monkeypatch):
    (tmp_path / "good.png").write_bytes(b"good")
    (tmp_path / "bad.png").write_bytes(b"bad")
    manifest = tmp_path / "test.jsonl"
    manifest.write_text("\n".join(json.dumps(row) for row in [
        {"sampleId": "one", "image": "good.png", "latex": "x^2"},
        {"sampleId": "two", "image": "bad.png", "latex": "y^2"},
    ]))

    class FakeRecognizer:
        model_id = "fake"

        def __init__(self, model_id):
            self.model_id = model_id

        def recognize(self, image_bytes, crop=None):
            if image_bytes == b"bad":
                raise InvalidModelOutput("y^{2", "Unbalanced braces")
            return "x^{2}"

    monkeypatch.setattr(evaluate_checkpoint, "TrOCRFormulaRecognizer", FakeRecognizer)
    result = evaluate_checkpoint.evaluate("fake", manifest)
    assert result["meanSampleCer"] == 0.5
    assert result["exactMatches"] == 1
    assert result["failedPredictions"] == 1
    assert result["samples"][1]["raw_latex"] == "y^{2"
