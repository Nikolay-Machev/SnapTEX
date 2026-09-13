from __future__ import annotations

import argparse
import json
import random
import shutil
import tarfile
import urllib.request
from pathlib import Path

from snaptex_ml.inkml import read_inkml, verified_label
from snaptex_ml.rasterize import render_ink_png

DATASET_URL = (
    "https://storage.googleapis.com/mathwriting_data/mathwriting-2024.tgz"
)
LICENSE = "CC BY-NC-SA 4.0; LaTeX labels include CC BY-SA 4.0 Wikipedia content"


def safe_extract(archive: Path, destination: Path) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        root = destination.resolve()
        for member in tar.getmembers():
            target = (destination / member.name).resolve()
            if root not in target.parents and target != root:
                raise ValueError(f"Unsafe archive member: {member.name}")
        tar.extractall(destination, filter="data")
    candidates = [path for path in destination.iterdir() if path.is_dir()]
    if len(candidates) != 1:
        raise ValueError("Expected exactly one dataset directory in the archive")
    return candidates[0]


def equation_features(latex: str) -> set[str]:
    features = set()
    checks = {
        "fraction": (r"\frac", r"\dfrac", r"\tfrac"),
        "large-operator": (r"\int", r"\sum", r"\prod"),
        "greek": (r"\alpha", r"\beta", r"\gamma", r"\theta", r"\pi"),
        "matrix": (r"\begin{matrix", r"\begin{pmatrix", r"\begin{bmatrix"),
        "accent": (r"\hat", r"\bar", r"\vec", r"\overline"),
        "partial": (r"\partial",),
    }
    for name, tokens in checks.items():
        if any(token in latex for token in tokens):
            features.add(name)
    if latex.count("_") + latex.count("^") >= 2:
        features.add("multi-script")
    if len(latex) >= 40:
        features.add("long")
    return features


def choose(paths: list[Path], count: int, seed: int, split: str) -> list[Path]:
    if len(paths) < count:
        raise ValueError(f"Requested {count} samples, but only {len(paths)} are available")
    generator = random.Random(seed)
    shuffled = sorted(paths)
    generator.shuffle(shuffled)
    pool = shuffled[: min(len(shuffled), max(count * 8, count))]
    scored = []
    for path in pool:
        ink = read_inkml(path)
        latex = verified_label(ink, split)
        scored.append((len(equation_features(latex)), len(latex), path))
    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    complex_count = min(count // 2, len(scored))
    complex_paths = [item[2] for item in scored[:complex_count]]
    remaining = [item[2] for item in scored[complex_count:]]
    selected = complex_paths + generator.sample(remaining, count - complex_count)
    return sorted(selected)


def prepare_split(
    source_root: Path,
    output_root: Path,
    split: str,
    count: int,
    seed: int,
) -> list[dict[str, object]]:
    selected = choose(list((source_root / split).glob("*.inkml")), count, seed, split)
    records = []
    seen_ids: set[str] = set()
    for source in selected:
        ink = read_inkml(source)
        latex = verified_label(ink, split)
        sample_id = ink.annotations["sampleId"]
        if sample_id in seen_ids:
            raise ValueError(f"Duplicate sample id: {sample_id}")
        seen_ids.add(sample_id)
        relative_image = Path("images") / split / f"{sample_id}.png"
        render_ink_png(ink, output_root / relative_image)
        records.append(
            {
                "image": relative_image.as_posix(),
                "latex": latex,
                "sampleId": sample_id,
                "sourceSplit": split,
                "inkCreationMethod": "human",
                "source": "Google Research MathWriting 2024",
                "license": LICENSE,
            }
        )
    return records


def write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare verified MathWriting samples")
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--source-root", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/mathwriting-2700"))
    parser.add_argument("--train-count", type=int, default=2400)
    parser.add_argument("--validation-count", type=int, default=300)
    parser.add_argument("--seed", type=int, default=20260904)
    parser.add_argument("--download", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.output.exists():
        raise FileExistsError(f"Output already exists: {args.output}")
    source_root = args.source_root
    archive = args.archive or Path("data/downloads/mathwriting-2024.tgz")
    if source_root is None:
        if not archive.exists():
            if not args.download:
                raise FileNotFoundError("Provide --source-root/--archive or add --download")
            archive.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(DATASET_URL) as response, archive.open("wb") as file:
                shutil.copyfileobj(response, file)
        source_root = safe_extract(archive, Path("data/extracted"))

    args.output.mkdir(parents=True)
    train = prepare_split(
        source_root, args.output, "train", args.train_count, args.seed
    )
    validation = prepare_split(
        source_root, args.output, "valid", args.validation_count, args.seed + 1
    )
    train_ids = {record["sampleId"] for record in train}
    validation_ids = {record["sampleId"] for record in validation}
    overlap = train_ids & validation_ids
    if overlap:
        raise ValueError(f"Train/validation leakage detected: {sorted(overlap)[:3]}")
    write_jsonl(args.output / "train.jsonl", train)
    write_jsonl(args.output / "validation.jsonl", validation)
    metadata = {
        "dataset": "Google Research MathWriting 2024",
        "source": DATASET_URL,
        "license": LICENSE,
        "seed": args.seed,
        "trainCount": len(train),
        "validationCount": len(validation),
        "humanWrittenOnly": True,
        "selection": "50% complexity-enriched from deterministic candidate pool",
    }
    (args.output / "dataset.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Prepared {len(train) + len(validation)} verified samples in {args.output}")


if __name__ == "__main__":
    main()
