from __future__ import annotations

import os
from io import BytesIO
from typing import Protocol

import torch
from PIL import Image, ImageOps
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

DEFAULT_MODEL_ID = "tjoab/latex_finetuned"


class FormulaRecognizer(Protocol):
    model_id: str

    def recognize(self, image_bytes: bytes) -> str: ...


def select_device() -> torch.device:
    requested = os.getenv("SNAPTEX_DEVICE", "auto")
    if requested != "auto":
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def prepare_image(image_bytes: bytes) -> Image.Image:
    with Image.open(BytesIO(image_bytes)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    # Preserve content while making transparent/uneven page backgrounds consistent.
    return ImageOps.autocontrast(image, cutoff=1)


class TrOCRFormulaRecognizer:
    def __init__(self, model_id: str | None = None) -> None:
        self.model_id = model_id or os.getenv("SNAPTEX_MODEL_ID", DEFAULT_MODEL_ID)
        self.device = select_device()
        self.processor = TrOCRProcessor.from_pretrained(self.model_id)
        self.model = VisionEncoderDecoderModel.from_pretrained(self.model_id)
        self.model.to(self.device)
        self.model.eval()

    @torch.inference_mode()
    def recognize(self, image_bytes: bytes) -> str:
        image = prepare_image(image_bytes)
        pixel_values = self.processor.image_processor(
            images=image, return_tensors="pt"
        ).pixel_values.to(self.device)
        token_ids = self.model.generate(pixel_values, max_length=256, num_beams=4)
        latex = self.processor.batch_decode(
            token_ids, skip_special_tokens=True
        )[0].strip()
        if not latex:
            raise ValueError("The model returned an empty transcription.")
        return latex
