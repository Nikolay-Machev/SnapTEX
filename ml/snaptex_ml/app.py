from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
import time
from typing import AsyncIterator
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError, model_validator

from .model import FormulaRecognizer, TrOCRFormulaRecognizer
from .runtime import (
    Metrics,
    RuntimeSettings,
    SlidingWindowRateLimiter,
    configure_logging,
)

MAX_IMAGE_BYTES = 8 * 1024 * 1024
SUPPORTED_TYPES = {"image/jpeg", "image/png", "image/webp"}


class RecognitionResponse(BaseModel):
    latex: str
    warnings: list[dict[str, str]]
    model: str


class CropRequest(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def contained_in_image(self) -> "CropRequest":
        if self.x + self.width > 1 or self.y + self.height > 1:
            raise ValueError("Crop must be contained in the image.")
        return self


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.recognizer = TrOCRFormulaRecognizer()
    yield


def create_app(
    recognizer: FormulaRecognizer | None = None,
    settings: RuntimeSettings | None = None,
) -> FastAPI:
    runtime = settings or RuntimeSettings.from_environment()
    application = FastAPI(
        title="SnapTEX local recognition service",
        lifespan=None if recognizer else lifespan,
    )
    if recognizer:
        application.state.recognizer = recognizer
    application.state.settings = runtime
    application.state.inference_slots = asyncio.Semaphore(
        runtime.max_concurrent_inferences
    )
    application.state.rate_limiter = SlidingWindowRateLimiter(
        runtime.rate_limit_requests, runtime.rate_limit_window_seconds
    )
    application.state.metrics = Metrics()
    logger = configure_logging()

    @application.middleware("http")
    async def observe_requests(request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid4()))[:128]
        started = time.monotonic()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "unhandled_request_error",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                },
            )
            raise
        duration = time.monotonic() - started
        application.state.metrics.record(status=response.status_code, duration=duration)
        response.headers["X-Request-ID"] = request_id
        response.headers["Cache-Control"] = "no-store"
        logger.info(
            "request_complete",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration * 1000, 2),
            },
        )
        return response

    @application.get("/health")
    async def health(request: Request) -> dict[str, str]:
        model = request.app.state.recognizer
        return {"status": "ok", "model": model.model_id}

    @application.get("/ready")
    async def ready(request: Request) -> dict[str, str]:
        model = getattr(request.app.state, "recognizer", None)
        if model is None:
            raise HTTPException(status_code=503, detail="Model is not loaded.")
        return {"status": "ready", "model": model.model_id}

    @application.get("/metrics")
    async def metrics(request: Request) -> dict[str, int | float]:
        return request.app.state.metrics.snapshot()

    @application.post("/recognize", response_model=RecognitionResponse)
    async def recognize(
        request: Request,
        image: UploadFile = File(...),
        crop: str | None = Form(default=None),
    ) -> RecognitionResponse:
        settings: RuntimeSettings = request.app.state.settings
        if settings.trust_proxy:
            client_key = request.headers.get("x-forwarded-for", "unknown").split(",")[0]
        else:
            client_key = request.client.host if request.client else "unknown"
        allowed, retry_after = request.app.state.rate_limiter.allow(client_key.strip())
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Recognition rate limit exceeded."},
                headers={"Retry-After": str(retry_after)},
            )

        if image.content_type not in SUPPORTED_TYPES:
            raise HTTPException(status_code=415, detail="Unsupported image type.")
        image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
        if not image_bytes:
            raise HTTPException(status_code=400, detail="The image is empty.")
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="The image exceeds 8 MB.")

        crop_values = None
        if crop:
            try:
                parsed_crop = CropRequest.model_validate_json(crop)
                crop_values = (
                    parsed_crop.x,
                    parsed_crop.y,
                    parsed_crop.width,
                    parsed_crop.height,
                )
            except ValidationError as error:
                raise HTTPException(status_code=400, detail="Invalid crop region.") from error

        model: FormulaRecognizer = request.app.state.recognizer
        semaphore: asyncio.Semaphore = request.app.state.inference_slots
        try:
            await asyncio.wait_for(
                semaphore.acquire(), timeout=settings.queue_timeout_seconds
            )
        except TimeoutError as error:
            raise HTTPException(
                status_code=503, detail="Recognition service is busy."
            ) from error

        release_on_return = True
        inference = asyncio.create_task(
            run_in_threadpool(model.recognize, image_bytes, crop_values)
        )
        try:
            latex = await asyncio.wait_for(
                asyncio.shield(inference), timeout=settings.inference_timeout_seconds
            )
        except TimeoutError as error:
            release_on_return = False
            inference.add_done_callback(lambda _: semaphore.release())
            raise HTTPException(status_code=504, detail="Recognition timed out.") from error
        except Exception as error:
            raise HTTPException(status_code=422, detail="Recognition failed.") from error
        finally:
            if release_on_return:
                semaphore.release()
        return RecognitionResponse(latex=latex, warnings=[], model=model.model_id)

    return application


app = create_app()
