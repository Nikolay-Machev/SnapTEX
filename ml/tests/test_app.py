from fastapi.testclient import TestClient

from snaptex_ml.app import create_app


class FakeRecognizer:
    model_id = "fake-model"

    def recognize(self, image_bytes: bytes) -> str:
        assert image_bytes == b"jpeg-data"
        return r"E = mc^2"


client = TestClient(create_app(FakeRecognizer()))


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


def test_rejects_unsupported_type() -> None:
    response = client.post(
        "/recognize",
        files={"image": ("equation.gif", b"gif-data", "image/gif")},
    )
    assert response.status_code == 415
