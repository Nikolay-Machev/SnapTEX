from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Iterable

from PIL import Image

from .preprocessing import validate_latex


SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass(frozen=True)
class DatasetRecord:
    image: Path
    latex: str
    sample_id: str
    sha256: str


def image_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_manifest(path: Path) -> list[DatasetRecord]:
    records = []
    seen_ids: set[str] = set()
    seen_hashes: set[str] = set()
    for line_number, line in enumerate(path.read_text().splitlines(), start=1):
        if not line.strip():
            continue
        payload = json.loads(line)
        image = (path.parent / payload["image"]).resolve()
        latex = validate_latex(str(payload.get("latex", "")))
        if latex == "REPLACE_WITH_VERIFIED_LATEX":
            raise ValueError(f"{path}:{line_number} still needs a verified LaTeX label")
        sample_id = str(payload.get("sampleId", "")).strip()
        if not sample_id:
            raise ValueError(f"{path}:{line_number} has no sampleId")
        if sample_id in seen_ids:
            raise ValueError(f"Duplicate sampleId in {path}: {sample_id}")
        if not image.is_file() or image.suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES:
            raise ValueError(f"Missing or unsupported image in {path}: {image}")
        try:
            with Image.open(image) as source:
                source.verify()
        except Exception as error:
            raise ValueError(f"Unreadable image in {path}: {image}") from error
        digest = image_sha256(image)
        declared_digest = payload.get("sha256")
        if declared_digest is not None and declared_digest != digest:
            raise ValueError(f"SHA-256 mismatch in {path}: {image}")
        if digest in seen_hashes:
            raise ValueError(f"Duplicate image content in {path}: {image}")
        seen_ids.add(sample_id)
        seen_hashes.add(digest)
        records.append(DatasetRecord(image, latex, sample_id, digest))
    if not records:
        raise ValueError(f"Manifest contains no records: {path}")
    return records


def assert_disjoint(named_splits: dict[str, Iterable[DatasetRecord]]) -> None:
    owners_by_id: dict[str, str] = {}
    owners_by_hash: dict[str, str] = {}
    for split, records in named_splits.items():
        for record in records:
            prior_id = owners_by_id.get(record.sample_id)
            if prior_id is not None:
                raise ValueError(
                    f"Sample ID leakage between {prior_id} and {split}: "
                    f"{record.sample_id}"
                )
            prior_hash = owners_by_hash.get(record.sha256)
            if prior_hash is not None:
                raise ValueError(
                    f"Image leakage between {prior_hash} and {split}: "
                    f"{record.image}"
                )
            owners_by_id[record.sample_id] = split
            owners_by_hash[record.sha256] = split


def fixture_hashes(directory: Path) -> set[str]:
    return {
        image_sha256(path)
        for path in directory.iterdir()
        if path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES
    }


def assert_not_in_holdout(
    records: Iterable[DatasetRecord], holdout_directory: Path
) -> None:
    protected = fixture_hashes(holdout_directory)
    overlap = [record.image for record in records if record.sha256 in protected]
    if overlap:
        raise ValueError(f"Protected evaluation image entered training data: {overlap[0]}")
