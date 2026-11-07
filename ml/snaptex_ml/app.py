from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
import time
import secrets
from typing import AsyncIterator
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError, model_validator

from .model import FormulaRecognizer, InvalidModelOutput, TrOCRFormulaRecognizer
from .preprocessing import locate_equation_regions, normalize_page_orientation
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
    warnings: list[dict]
    model: str


class PageBlockResponse(BaseModel):
    type: str
    content: str
    order: int
    confidence: float | None = None


class PageRecognitionResponse(BaseModel):
    blocks: list[PageBlockResponse]
    warnings: list[dict]
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
    # At most one page uses the shared model at a time; with >=2 slots an
    # equation can run alongside it. Each page yields its slot between regions.
    application.state.document_slots = asyncio.Semaphore(1)
    application.state.rate_limiter = SlidingWindowRateLimiter(
        runtime.rate_limit_requests, runtime.rate_limit_window_seconds
    )
    application.state.metrics = Metrics()
    logger = configure_logging()

    @application.middleware("http")
    async def observe_requests(request: Request, call_next):
        if request.url.path in {"/recognize", "/recognize-page"} and runtime.service_token:
            if not secrets.compare_digest(request.headers.get("x-snaptex-service-token", ""), runtime.service_token):
                return JSONResponse(status_code=401, content={"detail": "Recognition service authentication required."})
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

    def admit(request: Request):
        if runtime.service_token:
            supplied = request.headers.get("x-snaptex-service-token", "")
            if not secrets.compare_digest(supplied, runtime.service_token):
                raise HTTPException(status_code=401, detail="Recognition service authentication required.")
            # The authenticated web server has already limited this user.
            return
        # Standalone service: use the transport peer, never unverified proxy headers.
        key = request.client.host if request.client else "unknown"
        allowed, retry_after = request.app.state.rate_limiter.allow(key)
        if not allowed:
            raise HTTPException(status_code=429, detail="Recognition rate limit exceeded.", headers={"Retry-After": str(retry_after)})

    async def infer(request: Request, image_bytes: bytes, crop_values, *, page: bool = False):
        semaphore = request.app.state.inference_slots
        document_slot = request.app.state.document_slots if page else None
        if document_slot:
            try:
                await asyncio.wait_for(document_slot.acquire(), timeout=runtime.inference_timeout_seconds)
            except TimeoutError as error:
                raise HTTPException(status_code=503, detail="Page recognition is busy.") from error
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=runtime.inference_timeout_seconds if page else runtime.queue_timeout_seconds)
        except TimeoutError as error:
            if document_slot:
                document_slot.release()
            raise HTTPException(status_code=503, detail="Recognition service is busy.") from error
        except BaseException:
            if document_slot:
                document_slot.release()
            raise
        task = asyncio.create_task(run_in_threadpool(request.app.state.recognizer.recognize, image_bytes, crop_values))
        release_on_return = True
        def release():
            semaphore.release()
            if document_slot:
                document_slot.release()
        def release_when_finished(completed):
            if not completed.cancelled():
                completed.exception()
            release()
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=runtime.inference_timeout_seconds)
        except (TimeoutError, asyncio.CancelledError):
            release_on_return = False
            task.add_done_callback(release_when_finished)
            raise
        finally:
            if release_on_return:
                release()

    @application.post("/recognize", response_model=RecognitionResponse)
    async def recognize(
        request: Request,
        image: UploadFile = File(...),
        crop: str | None = Form(default=None),
    ) -> RecognitionResponse:
        settings: RuntimeSettings = request.app.state.settings
        admit(request)

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
        try:
            latex = await infer(request, image_bytes, crop_values)
        except TimeoutError as error:
            raise HTTPException(status_code=504, detail="Recognition timed out or the queue is busy.") from error
        except InvalidModelOutput as error:
            if settings.diagnostics:
                return JSONResponse(
                    status_code=422,
                    content={
                        "detail": {
                            "code": "INVALID_MODEL_OUTPUT",
                            "reason": error.reason,
                            "raw_latex": error.raw_latex,
                        }
                    },
                )
            raise HTTPException(status_code=422, detail="Recognition failed.") from error
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(status_code=422, detail="Recognition failed.") from error
        return RecognitionResponse(latex=latex, warnings=[], model=model.model_id)

    @application.post("/recognize-page", response_model=PageRecognitionResponse)
    async def recognize_page(
        request: Request,
        image: UploadFile = File(...),
    ) -> PageRecognitionResponse:
        settings: RuntimeSettings = request.app.state.settings
        admit(request)

        if image.content_type not in SUPPORTED_TYPES:
            raise HTTPException(status_code=415, detail="Unsupported image type.")
        image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
        if not image_bytes:
            raise HTTPException(status_code=400, detail="The image is empty.")
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="The image exceeds 8 MB.")
        try:
            oriented_bytes, rotation = await run_in_threadpool(
                normalize_page_orientation, image_bytes
            )
            crops = await run_in_threadpool(locate_equation_regions, oriented_bytes)
        except Exception as error:
            raise HTTPException(status_code=422, detail="Page localization failed.") from error
        warnings: list[dict] = []
        if not crops:
            return PageRecognitionResponse(blocks=[], warnings=[{"code": "UNREADABLE_REGION", "message": "No equation regions were detected on this page.", "region": 1, "crop": {"x": 0, "y": 0, "width": 1, "height": 1}}], model=request.app.state.recognizer.model_id)

        model: FormulaRecognizer = request.app.state.recognizer
        blocks: list[PageBlockResponse] = []
        for order, crop_values in enumerate(crops, start=1):
            if await request.is_disconnected():
                raise HTTPException(status_code=499, detail="The page request was disconnected.")
            try:
                latex = await infer(request, oriented_bytes, crop_values, page=True)
            except (InvalidModelOutput, ValueError):
                x, y, width, height = crop_values
                if rotation:
                    x, y, width, height = 1 - y - height, x, height, width
                warnings.append({"code": "UNREADABLE_REGION", "message": f"Region {order} could not be read.", "region": order,
                    "crop": {"x": max(0, x), "y": max(0, y), "width": width, "height": height}})
                continue
            except TimeoutError as error:
                raise HTTPException(status_code=504, detail="Page recognition timed out.") from error
            blocks.append(PageBlockResponse(type="display-math", content=latex, order=order))
            await asyncio.sleep(0)
        warnings.extend([
            {
                "code": "TEXT_OCR_UNAVAILABLE",
                "message": (
                    "Handwritten prose is not transcribed by the current local model; "
                    "equation regions only were included."
                ),
            }
        ])
        if rotation:
            warnings.append(
                {
                    "code": "PAGE_ROTATED",
                    "message": "The page was rotated automatically before recognition.",
                }
            )
        return PageRecognitionResponse(
            blocks=blocks,
            warnings=warnings,
            model=model.model_id,
        )

    return application


app = create_app()
