from __future__ import annotations

import json
from pathlib import Path

from PIL import Image
import pytest

from snaptex_ml.data_validation import (
    assert_disjoint,
    assert_not_in_holdout,
    image_sha256,
    read_manifest,
)


def create_record(root: Path, name: str, color: str = "white") -> Path:
    image = root / f"{name}.png"
    Image.new("RGB", (32, 24), color).save(image)
    manifest = root / f"{name}.jsonl"
    manifest.write_text(
        json.dumps(
            {
                "image": image.name,
                "latex": "x=1",
                "sampleId": name,
                "sha256": image_sha256(image),
            }
        )
        + "\n"
    )
    return manifest


def test_reads_verified_manifest(tmp_path) -> None:
    records = read_manifest(create_record(tmp_path, "train"))
    assert records[0].latex == "x=1"


def test_rejects_unlabeled_photo_template(tmp_path) -> None:
    manifest = create_record(tmp_path, "photo")
    payload = json.loads(manifest.read_text())
    payload["latex"] = "REPLACE_WITH_VERIFIED_LATEX"
    manifest.write_text(json.dumps(payload) + "\n")
    with pytest.raises(ValueError, match="needs a verified LaTeX label"):
        read_manifest(manifest)


def test_rejects_split_leakage_by_image_hash(tmp_path) -> None:
    train = read_manifest(create_record(tmp_path, "train", "white"))
    validation_manifest = create_record(tmp_path, "validation", "white")
    validation = read_manifest(validation_manifest)
    with pytest.raises(ValueError, match="Image leakage"):
        assert_disjoint({"train": train, "validation": validation})


def test_protects_original_evaluation_images(tmp_path) -> None:
    holdout = tmp_path / "holdout"
    holdout.mkdir()
    manifest = create_record(tmp_path, "train", "blue")
    (holdout / "original.png").write_bytes((tmp_path / "train.png").read_bytes())
    with pytest.raises(ValueError, match="Protected evaluation image"):
        assert_not_in_holdout(read_manifest(manifest), holdout)
