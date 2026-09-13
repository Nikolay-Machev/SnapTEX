from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import re
import time
from typing import Callable, Protocol, Sequence

from PIL import Image

from .model import InvalidModelOutput, TrOCRFormulaRecognizer, select_device
from .preprocessing import NormalizedCrop, prepare_equation_image, validate_latex


class BenchmarkRecognizer(Protocol):
    model_id: str

    def recognize(
        self,
        image_bytes: bytes,
        crop: NormalizedCrop | None = None,
    ) -> str: ...


@dataclass(frozen=True)
class Fixture:
    file: str
    expected_latex: str
    crop: NormalizedCrop | None = None


@dataclass(frozen=True)
class Prediction:
    file: str
    expected_latex: str
    predicted_latex: str | None
    cer: float
    latency_seconds: float
    error: str | None
    raw_latex: str | None


@dataclass(frozen=True)
class ModelResult:
    model: str
    crop_mode: str
    average_cer: float
    exact_matches: int
    error_count: int
    average_latency_seconds: float
    results: list[Prediction]


def normalize_latex(latex: str) -> str:
    """Match the normalization used by scripts/evaluation.ts."""
    value = re.sub(r"^\$\$?|\$\$?$", "", latex)
    value = re.sub(r"\s+", "", value)
    value = value.replace(r"\left", "").replace(r"\right", "")
    value = re.sub(r"([_^])\{([^{}\\])\}", r"\1\2", value)
    return value.strip()


def levenshtein_distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1]
                    + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def character_error_rate(expected: str, predicted: str) -> float:
    normalized_expected = normalize_latex(expected)
    normalized_predicted = normalize_latex(predicted)
    return levenshtein_distance(normalized_expected, normalized_predicted) / max(
        len(normalized_expected), 1
    )


def load_fixtures(manifest_path: Path) -> list[Fixture]:
    payload = json.loads(manifest_path.read_text())
    fixtures = []
    for item in payload:
        crop_payload = item.get("crop")
        crop = None
        if crop_payload is not None:
            crop = (
                float(crop_payload["x"]),
                float(crop_payload["y"]),
                float(crop_payload["width"]),
                float(crop_payload["height"]),
            )
        fixtures.append(
            Fixture(
                file=item["file"],
                expected_latex=item["expectedLatex"],
                crop=crop,
            )
        )
    return fixtures


class Pix2TexRecognizer:
    model_id = "pix2tex"

    def __init__(self) -> None:
        try:
            from pix2tex.cli import LatexOCR
        except ImportError as error:
            raise RuntimeError(
                "pix2tex is not installed; install ml/requirements-benchmark.txt"
            ) from error
        self.model = LatexOCR()

    def recognize(
        self,
        image_bytes: bytes,
        crop: NormalizedCrop | None = None,
    ) -> str:
        image = prepare_equation_image(image_bytes, crop).image
        raw_latex = str(self.model(image)).strip()
        try:
            return validate_latex(raw_latex)
        except ValueError as error:
            raise InvalidModelOutput(raw_latex, str(error)) from error


class Pix2TextRecognizer:
    model_id = "pix2text-mfr-1.5"

    def __init__(self) -> None:
        try:
            from pix2text import LatexOCR
        except ImportError as error:
            raise RuntimeError(
                "pix2text is not installed; install ml/requirements-benchmark.txt"
            ) from error
        device = select_device().type
        backend = os.getenv("SNAPTEX_PIX2TEXT_BACKEND", "onnx")
        if backend not in {"onnx", "pytorch"}:
            raise ValueError(
                "SNAPTEX_PIX2TEXT_BACKEND must be 'onnx' or 'pytorch'."
            )
        self.model = LatexOCR(
            model_name="mfr-1.5",
            model_backend=backend,
            device="cuda" if device == "cuda" else "cpu",
        )

    def recognize(
        self,
        image_bytes: bytes,
        crop: NormalizedCrop | None = None,
    ) -> str:
        image = prepare_equation_image(image_bytes, crop).image
        result = self.model.recognize(image)
        raw_latex = str(result["text"]).strip()
        try:
            return validate_latex(raw_latex)
        except ValueError as error:
            raise InvalidModelOutput(raw_latex, str(error)) from error


MODEL_FACTORIES: dict[str, Callable[[], BenchmarkRecognizer]] = {
    "baseline": TrOCRFormulaRecognizer,
    "pix2tex": Pix2TexRecognizer,
    "pix2text": Pix2TextRecognizer,
}


def evaluate_model(
    recognizer: BenchmarkRecognizer,
    fixtures: Sequence[Fixture],
    fixture_directory: Path,
    crop_mode: str,
) -> ModelResult:
    if crop_mode not in {"automatic", "manual"}:
        raise ValueError("crop_mode must be automatic or manual")

    predictions = []
    for fixture in fixtures:
        image_bytes = (fixture_directory / fixture.file).read_bytes()
        crop = fixture.crop if crop_mode == "manual" else None
        started = time.perf_counter()
        predicted_latex = None
        raw_latex = None
        error_message = None
        try:
            predicted_latex = recognizer.recognize(image_bytes, crop)
            cer = character_error_rate(fixture.expected_latex, predicted_latex)
        except Exception as error:  # keep one failed model output from ending a bakeoff
            cer = 1.0
            error_message = str(error)
            if isinstance(error, InvalidModelOutput):
                raw_latex = error.raw_latex
        predictions.append(
            Prediction(
                file=fixture.file,
                expected_latex=fixture.expected_latex,
                predicted_latex=predicted_latex,
                cer=cer,
                latency_seconds=time.perf_counter() - started,
                error=error_message,
                raw_latex=raw_latex,
            )
        )

    count = len(predictions)
    return ModelResult(
        model=recognizer.model_id,
        crop_mode=crop_mode,
        average_cer=sum(item.cer for item in predictions) / max(count, 1),
        exact_matches=sum(item.cer == 0 for item in predictions),
        error_count=sum(item.error is not None for item in predictions),
        average_latency_seconds=sum(item.latency_seconds for item in predictions)
        / max(count, 1),
        results=predictions,
    )


def rank_results(results: Sequence[ModelResult]) -> list[ModelResult]:
    return sorted(
        results,
        key=lambda result: (
            result.average_cer,
            result.error_count,
            -result.exact_matches,
            result.average_latency_seconds,
        ),
    )


def result_as_dict(result: ModelResult) -> dict:
    return asdict(result)
