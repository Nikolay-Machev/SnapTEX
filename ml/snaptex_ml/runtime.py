from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
import json
import logging
import os
from threading import Lock
import time


def _positive_int(name: str, default: int) -> int:
    value = int(os.getenv(name, str(default)))
    if value < 1:
        raise ValueError(f"{name} must be at least 1.")
    return value


def _positive_float(name: str, default: float) -> float:
    value = float(os.getenv(name, str(default)))
    if value <= 0:
        raise ValueError(f"{name} must be greater than 0.")
    return value


@dataclass(frozen=True)
class RuntimeSettings:
    max_concurrent_inferences: int = 2
    queue_timeout_seconds: float = 2.0
    inference_timeout_seconds: float = 120.0
    rate_limit_requests: int = 30
    rate_limit_window_seconds: int = 60
    trust_proxy: bool = False

    @classmethod
    def from_environment(cls) -> "RuntimeSettings":
        return cls(
            max_concurrent_inferences=_positive_int("SNAPTEX_MAX_CONCURRENCY", 2),
            queue_timeout_seconds=_positive_float("SNAPTEX_QUEUE_TIMEOUT_SECONDS", 2),
            inference_timeout_seconds=_positive_float(
                "SNAPTEX_INFERENCE_TIMEOUT_SECONDS", 120
            ),
            rate_limit_requests=_positive_int("SNAPTEX_RATE_LIMIT_REQUESTS", 30),
            rate_limit_window_seconds=_positive_int(
                "SNAPTEX_RATE_LIMIT_WINDOW_SECONDS", 60
            ),
            trust_proxy=os.getenv("SNAPTEX_TRUST_PROXY", "false").lower() == "true",
        )


class SlidingWindowRateLimiter:
    def __init__(self, requests: int, window_seconds: int) -> None:
        self.requests = requests
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, now: float | None = None) -> tuple[bool, int]:
        timestamp = time.monotonic() if now is None else now
        cutoff = timestamp - self.window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.requests:
                retry_after = max(1, int(self.window_seconds - (timestamp - events[0])))
                return False, retry_after
            events.append(timestamp)
            return True, 0


class Metrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self.requests = 0
        self.failures = 0
        self.rate_limited = 0
        self.busy = 0
        self.inference_seconds = 0.0

    def record(self, *, status: int, duration: float) -> None:
        with self._lock:
            self.requests += 1
            self.inference_seconds += duration
            if status >= 400:
                self.failures += 1
            if status == 429:
                self.rate_limited += 1
            if status == 503:
                self.busy += 1

    def snapshot(self) -> dict[str, int | float]:
        with self._lock:
            return {
                "requests_total": self.requests,
                "failures_total": self.failures,
                "rate_limited_total": self.rate_limited,
                "busy_total": self.busy,
                "request_duration_seconds_total": round(self.inference_seconds, 6),
            }


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%SZ"),
            "level": record.levelname.lower(),
            "message": record.getMessage(),
        }
        for field in ("request_id", "method", "path", "status", "duration_ms"):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        return json.dumps(payload, separators=(",", ":"))


def configure_logging() -> logging.Logger:
    logger = logging.getLogger("snaptex")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.setLevel(os.getenv("SNAPTEX_LOG_LEVEL", "INFO").upper())
    logger.propagate = False
    return logger
