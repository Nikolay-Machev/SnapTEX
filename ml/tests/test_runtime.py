import pytest

from snaptex_ml.runtime import RuntimeSettings, SlidingWindowRateLimiter


def test_sliding_window_releases_expired_requests() -> None:
    limiter = SlidingWindowRateLimiter(requests=2, window_seconds=10)
    assert limiter.allow("client", now=0)[0] is True
    assert limiter.allow("client", now=1)[0] is True
    assert limiter.allow("client", now=2)[0] is False
    assert limiter.allow("client", now=11)[0] is True


def test_runtime_settings_reject_zero_concurrency(monkeypatch) -> None:
    monkeypatch.setenv("SNAPTEX_MAX_CONCURRENCY", "0")
    with pytest.raises(ValueError):
        RuntimeSettings.from_environment()
