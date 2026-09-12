from fastapi.testclient import TestClient

from snaptex_ml.app import create_app


class FakeRecognizer:
    model_id = "fake-model"
    crop = None

    def recognize(self, image_bytes: bytes, crop=None) -> str:
        assert image_bytes == b"jpeg-data"
        self.crop = crop
        return r"E = mc^2"


client = TestClient(create_app(FakeRecognizer()))


def test_health_reports_loaded_model() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model": "fake-model"}


def test_recognize_contract() -> None:
    response = client.post(
        "/recognize",
        files={"image": ("equation.jpeg", b"jpeg-data", "image/jpeg")},
    )
    assert response.status_code == 200
    assert response.json() == {
        "latex": r"E = mc^2",
        "warnings": [],
        "model": "fake-model",
    }


def test_recognize_forwards_normalized_crop() -> None:
    response = client.post(
        "/recognize",
        files={"image": ("equation.jpeg", b"jpeg-data", "image/jpeg")},
        data={"crop": '{"x":0.1,"y":0.2,"width":0.5,"height":0.4}'},
    )
    assert response.status_code == 200
    assert client.app.state.recognizer.crop == (0.1, 0.2, 0.5, 0.4)


def test_rejects_crop_outside_image() -> None:
    response = client.post(
        "/recognize",
        files={"image": ("equation.jpeg", b"jpeg-data", "image/jpeg")},
        data={"crop": '{"x":0.8,"y":0.2,"width":0.5,"height":0.4}'},
    )
    assert response.status_code == 400


def test_rejects_unsupported_type() -> None:
    response = client.post(
        "/recognize",
        files={"image": ("equation.gif", b"gif-data", "image/gif")},
    )
    assert response.status_code == 415
