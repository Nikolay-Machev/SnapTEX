from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

import torch
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

from .preprocessing import prepare_equation_image, validate_latex

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


class TrOCRFormulaRecognizer:
    def __init__(self, model_id: str | None = None) -> None:
        self.model_id = model_id or os.getenv("SNAPTEX_MODEL_ID", DEFAULT_MODEL_ID)
        model_path = Path(self.model_id).expanduser()
        if self.model_id.startswith((".", "/", "~")) and not model_path.exists():
            raise FileNotFoundError(
                f"SnapTEX checkpoint does not exist: {model_path}. "
                "Train it first or set SNAPTEX_MODEL_ID to a valid checkpoint."
            )
        self.device = select_device()
        checkpoint = str(model_path) if model_path.exists() else self.model_id
        self.processor = TrOCRProcessor.from_pretrained(checkpoint)
        self.model = VisionEncoderDecoderModel.from_pretrained(checkpoint)
        self.model.to(self.device)
        self.model.eval()

    @torch.inference_mode()
    def recognize(self, image_bytes: bytes) -> str:
        image = prepare_equation_image(image_bytes).image
        pixel_values = self.processor.image_processor(
            images=image, return_tensors="pt"
        ).pixel_values.to(self.device)
        token_ids = self.model.generate(pixel_values, max_length=256, num_beams=4)
        latex = self.processor.batch_decode(
            token_ids, skip_special_tokens=True
        )[0].strip()
        return validate_latex(latex)
