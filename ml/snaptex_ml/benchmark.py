from __future__ import annotations

from dataclasses import dataclass
import json
import httpx
import os
import math
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
    """Canonical string normalization for all SnapTEX evaluations."""
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
                    previous[right_index - 1] + (left_character != right_character),
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
    text = manifest_path.read_text()
    payload = (
        [json.loads(line) for line in text.splitlines() if line.strip()]
        if manifest_path.suffix == ".jsonl"
        else json.loads(text)
    )
    fixtures = []
    for item in payload:
        raw_crop = item.get("crop")
        crop = (
            tuple(float(raw_crop[key]) for key in ("x", "y", "width", "height"))
            if raw_crop
            else None
        )
        if crop and (
            not all(math.isfinite(value) for value in crop)
            or min(crop[:2]) < 0
            or min(crop[2:]) <= 0
            or crop[0] + crop[2] > 1
            or crop[1] + crop[3] > 1
        ):
            raise ValueError("Invalid normalized crop in manifest")
        fixtures.append(
            Fixture(
                item.get("file", item.get("image")),
                item.get("expectedLatex", item.get("latex")),
                crop,
            )
        )
    if not fixtures or any(
        not row.file or not isinstance(row.expected_latex, str) for row in fixtures
    ):
        raise ValueError("Manifest must contain images with LaTeX labels")
    if len({row.file for row in fixtures}) != len(fixtures):
        raise ValueError("Manifest has duplicate image paths")
    for row in fixtures:
        if not (manifest_path.parent / row.file).is_file():
            raise FileNotFoundError(manifest_path.parent / row.file)
    return fixtures


class HttpRecognizer:
    """Exercise Node validation, admission, provider selection and recognition."""

    def __init__(
        self, endpoint: str, timeout: float = 120, interval: float = 0, client=None
    ):
        self.endpoint = endpoint
        self.model_id = endpoint
        self.client = client or httpx.Client(timeout=timeout)
        self.interval = interval
        self.last_request = 0.0
        self.provider = None

    def recognize(self, image_bytes: bytes, crop: NormalizedCrop | None = None) -> str:
        time.sleep(max(0, self.last_request + self.interval - time.monotonic()))
        self.last_request = time.monotonic()
        from io import BytesIO

        with Image.open(BytesIO(image_bytes)) as image:
            mime = Image.MIME.get(image.format, "application/octet-stream")
        data = (
            {"crop": json.dumps(dict(zip(("x", "y", "width", "height"), crop)))}
            if crop
            else {}
        )
        response = self.client.post(
            self.endpoint, files={"image": ("equation", image_bytes, mime)}, data=data
        )
        payload = response.json()
        if response.is_error or payload.get("success") is not True:
            raise RuntimeError(
                f"HTTP {response.status_code}: {payload.get('error', {}).get('message', 'conversion failed')}"
            )
        output = payload.get("result", {})
        provider = output.get("provider")
        if isinstance(provider, str):
            if self.provider is not None and provider != self.provider:
                raise ValueError("Node provider changed during evaluation")
            self.provider = provider
            self.model_id = provider
        latex = output.get("latex")
        if not isinstance(latex, str) or not latex.strip():
            raise ValueError("Node returned an invalid transcription")
        return latex

    def close(self):
        self.client.close()


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
            raise ValueError("SNAPTEX_PIX2TEXT_BACKEND must be 'onnx' or 'pytorch'.")
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


def category(
    expected: str,
    predicted: str | None,
    error: str | None,
    raw_invalid_output: str | None = None,
) -> str:
    """Mutually exclusive, diagnostic string categories (not mathematical equivalence)."""
    if error is not None:
        return "invalid_output" if raw_invalid_output is not None else "inference_error"
    assert predicted is not None
    left, right = normalize_latex(expected), normalize_latex(predicted)
    if left == right:
        return "exact"
    if not right:
        return "empty"
    if len(right) < len(left) / 2:
        return "short_output"
    if left.count(r"\frac") != right.count(r"\frac"):
        return "fraction"
    if left.count("^") != right.count("^") or left.count("_") != right.count("_"):
        return "scripts"
    if left.count("\\") != right.count("\\"):
        return "commands"
    return "other_mismatch"
