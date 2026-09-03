from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from .model import FormulaRecognizer, TrOCRFormulaRecognizer

MAX_IMAGE_BYTES = 8 * 1024 * 1024
SUPPORTED_TYPES = {"image/jpeg", "image/png", "image/webp"}


class RecognitionResponse(BaseModel):
    latex: str
    warnings: list[dict[str, str]]
    model: str


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.recognizer = TrOCRFormulaRecognizer()
    yield


def create_app(recognizer: FormulaRecognizer | None = None) -> FastAPI:
    application = FastAPI(
        title="SnapTEX local recognition service",
        lifespan=None if recognizer else lifespan,
    )
    if recognizer:
        application.state.recognizer = recognizer

    @application.get("/health")
    async def health(request: Request) -> dict[str, str]:
        model = request.app.state.recognizer
        return {"status": "ok", "model": model.model_id}

    @application.post("/recognize", response_model=RecognitionResponse)
    async def recognize(
        request: Request, image: UploadFile = File(...)
    ) -> RecognitionResponse:
        if image.content_type not in SUPPORTED_TYPES:
            raise HTTPException(status_code=415, detail="Unsupported image type.")
        image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
        if not image_bytes:
            raise HTTPException(status_code=400, detail="The image is empty.")
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="The image exceeds 8 MB.")

        model: FormulaRecognizer = request.app.state.recognizer
        try:
            latex = model.recognize(image_bytes)
        except Exception as error:
            raise HTTPException(status_code=422, detail="Recognition failed.") from error
        return RecognitionResponse(latex=latex, warnings=[], model=model.model_id)

    return application


app = create_app()
