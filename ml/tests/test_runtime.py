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


def test_limiter_evicts_expired_keys_and_bounds_new_keys() -> None:
    limiter = SlidingWindowRateLimiter(1, 10, max_keys=2)
    assert limiter.allow("a", now=0)[0]
    assert limiter.allow("b", now=1)[0]
    assert not limiter.allow("c", now=2)[0]
    assert not limiter.allow("a", now=3)[0]
    assert limiter.allow("c", now=12)[0]
    assert len(limiter._events) == 1
