import json
from io import BytesIO
import httpx
import pytest
from PIL import Image
import evaluate
from snaptex_ml.benchmark import HttpRecognizer, load_fixtures


def fixture(tmp_path):
    image = BytesIO()
    Image.new("RGB", (32, 32), "white").save(image, "PNG")
    (tmp_path / "eq.png").write_bytes(image.getvalue())
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps(
            [
                {
                    "file": "eq.png",
                    "expectedLatex": "x^2",
                    "crop": {"x": 0, "y": 0, "width": 1, "height": 1},
                }
            ]
        )
    )
    return path, image.getvalue()


def test_http_recognizer_sends_crop_and_reports_quota_failure(tmp_path):
    _, image = fixture(tmp_path)
    seen = []

    def transport(request):
        assert str(request.url) == "http://node/api/convert"
        seen.append(request.read())
        if len(seen) == 2:
            return httpx.Response(
                429, json={"success": False, "error": {"message": "Daily quota"}}
            )
        return httpx.Response(
            200,
            json={
                "success": True,
                "result": {"latex": "x^{2}", "provider": "mock:test"},
            },
        )

    with httpx.Client(transport=httpx.MockTransport(transport)) as client:
        recognizer = HttpRecognizer("http://node/api/convert", client=client)
        assert recognizer.recognize(image, (0, 0, 1, 1)) == "x^{2}"
        assert b'name="crop"' in seen[0] and b"image/png" in seen[0]
        with pytest.raises(RuntimeError, match="HTTP 429: Daily quota"):
            recognizer.recognize(image)
    assert len(seen) == 2  # no paid retries


def test_one_cli_outputs_paired_differences_hashes_and_gate_status(
    tmp_path, monkeypatch
):
    manifest, _ = fixture(tmp_path)

    class Recognizer:
        model_id = "stub"

        def __init__(self, latex):
            self.latex = latex

        def recognize(self, image, crop=None):
            return self.latex

    monkeypatch.setitem(
        evaluate.MODEL_FACTORIES, "control", lambda: Recognizer("x^{2}")
    )
    monkeypatch.setitem(
        evaluate.MODEL_FACTORIES, "candidate", lambda: Recognizer("x_2")
    )
    output = tmp_path / "report.json"
    status = evaluate.main(
        [
            "--model",
            "control",
            "--model",
            "candidate",
            "--baseline",
            "control",
            "--manifest",
            str(manifest),
            "--output",
            str(output),
            "--max-cer",
            "0.1",
            "--crop-mode",
            "both",
        ]
    )
    assert status == 1
    report = json.loads(output.read_text())
    assert len(report["evaluations"]) == 4
    assert len(report["manifest_sha256"]) == 64
    assert report["paired_differences"][0]["worsened"] == 1
    assert report["paired_differences"][0]["samples"][0]["delta_cer"] == pytest.approx(
        1 / 3
    )
    assert "Change" in output.with_suffix(".md").read_text()


def test_fixture_errors_are_detected_before_loading_models(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text("[]")
    with pytest.raises(ValueError, match="Manifest"):
        load_fixtures(path)
    path.write_text('[{"file":"absent.png","expectedLatex":"x"}]')
    with pytest.raises(FileNotFoundError):
        load_fixtures(path)
    manifest, _ = fixture(tmp_path)
    rows = json.loads(manifest.read_text())
    manifest.write_text(json.dumps(rows + rows))
    with pytest.raises(ValueError, match="duplicate"):
        load_fixtures(manifest)
