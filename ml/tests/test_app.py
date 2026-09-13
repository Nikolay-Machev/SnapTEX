from concurrent.futures import ThreadPoolExecutor
import time

from fastapi.testclient import TestClient

from snaptex_ml.app import create_app
from snaptex_ml.runtime import RuntimeSettings


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


def test_rejects_an_image_over_eight_megabytes() -> None:
    response = client.post(
        "/recognize",
        files={
            "image": (
                "oversized.jpeg",
                b"x" * (8 * 1024 * 1024 + 1),
                "image/jpeg",
            )
        },
    )
    assert response.status_code == 413


def test_rate_limits_recognition_requests() -> None:
    settings = RuntimeSettings(rate_limit_requests=1, rate_limit_window_seconds=60)
    limited_client = TestClient(create_app(FakeRecognizer(), settings))
    files = {"image": ("equation.jpeg", b"jpeg-data", "image/jpeg")}

    assert limited_client.post("/recognize", files=files).status_code == 200
    response = limited_client.post("/recognize", files=files)

    assert response.status_code == 429
    assert int(response.headers["retry-after"]) >= 1


class SlowRecognizer:
    model_id = "slow-model"

    def recognize(self, image_bytes: bytes, crop=None) -> str:
        time.sleep(0.1)
        return "x=1"


def test_rejects_work_when_inference_queue_is_full() -> None:
    settings = RuntimeSettings(
        max_concurrent_inferences=1,
        queue_timeout_seconds=0.01,
        inference_timeout_seconds=1,
        rate_limit_requests=10,
    )
    busy_client = TestClient(create_app(SlowRecognizer(), settings))

    def recognize_once():
        return busy_client.post(
            "/recognize",
            files={"image": ("equation.jpeg", b"jpeg-data", "image/jpeg")},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: recognize_once(), range(2)))

    assert sorted(response.status_code for response in responses) == [200, 503]


def test_times_out_slow_inference() -> None:
    settings = RuntimeSettings(
        inference_timeout_seconds=0.01,
        queue_timeout_seconds=1,
        rate_limit_requests=10,
    )
    timeout_client = TestClient(create_app(SlowRecognizer(), settings))
    response = timeout_client.post(
        "/recognize",
        files={"image": ("equation.jpeg", b"jpeg-data", "image/jpeg")},
    )
    assert response.status_code == 504


def test_metrics_and_privacy_headers_are_exposed() -> None:
    response = client.get("/metrics", headers={"X-Request-ID": "test-request"})
    assert response.status_code == 200
    assert response.headers["x-request-id"] == "test-request"
    assert response.headers["cache-control"] == "no-store"
    assert "requests_total" in response.json()
