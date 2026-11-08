import pytest
from snaptex_ml.runtime import RuntimeSettings


def test_runtime_settings_reject_zero_concurrency(monkeypatch):
    monkeypatch.setenv("SNAPTEX_MAX_CONCURRENCY", "0")
    with pytest.raises(ValueError):
        RuntimeSettings.from_environment()
