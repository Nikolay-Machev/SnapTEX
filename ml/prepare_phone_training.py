"""Create page-disjoint formula crops from the reviewed 100-page collection."""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

from PIL import Image, ImageOps, ImageStat

from snaptex_ml.data_validation import image_sha256
from snaptex_ml.preprocessing import validate_latex


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def split_pages(ids: list[str], seed: int, validation_pages: int, test_pages: int) -> dict[str, str]:
    if len(ids) != len(set(ids)) or validation_pages + test_pages >= len(ids):
        raise ValueError("Page IDs must be unique and leave at least one training page.")
    shuffled = sorted(ids)
    random.Random(seed).shuffle(shuffled)
    return {
        page: ("test" if index < test_pages else
               "validation" if index < test_pages + validation_pages else "train")
        for index, page in enumerate(shuffled)
    }


def oriented_size(value: dict | list) -> tuple[int, int]:
    return (int(value["width"]), int(value["height"])) if isinstance(value, dict) else tuple(value)


def create_dataset(
    index: Path, annotations: Path, images_dir: Path, output: Path,
    *, seed: int = 20260926, validation_pages: int = 10, test_pages: int = 20,
    allow_reencoded_originals: bool = False,
) -> dict:
    indexed = read_jsonl(index)
    annotated = read_jsonl(annotations)
    by_id = {row["sampleId"]: row for row in indexed}
    if len(indexed) != 100 or len(annotated) != 100 or len(by_id) != 100:
        raise ValueError("Expected 100 unique indexed and annotated pages.")
    if {row["sampleId"] for row in annotated} != set(by_id):
        raise ValueError("Index and annotation page IDs differ.")
    splits = split_pages(list(by_id), seed, validation_pages, test_pages)
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output is not empty: {output}. Use a fresh directory.")
    output.mkdir(parents=True, exist_ok=True)
    (output / "images").mkdir()
    records: dict[str, list[dict]] = {name: [] for name in ("train", "validation", "test")}
    mismatched_sources: list[str] = []
    skipped_long_labels: list[str] = []
    skipped_empty_crops: list[str] = []
    for page in annotated:
        page_id = page["sampleId"]
        source = by_id[page_id]
        if page["image"] != source["image"] or page["sha256"] != source["sha256"]:
            raise ValueError(f"Annotation/index identity mismatch for {page_id}.")
        if page["annotationStatus"] != "first-pass-reviewed":
            raise ValueError(f"Page has not passed first review: {page_id}.")
        filename = source.get("originalFilename")
        candidates = [images_dir / source["image"],
                      images_dir / Path(source["image"]).name,
                      images_dir / filename]
        image_path = next((candidate for candidate in candidates if candidate.is_file()), None)
        if image_path is None:
            raise FileNotFoundError(f"Missing image for {page_id}: {candidates}")
        actual_sha = image_sha256(image_path)
        if actual_sha != source["sha256"]:
            if not allow_reencoded_originals:
                raise ValueError(f"Image hash differs for {page_id}; use verified originals or explicitly allow reencoded originals.")
            mismatched_sources.append(page_id)
        with Image.open(image_path) as source_image:
            image = ImageOps.exif_transpose(source_image).convert("RGB")
        rotation = int(page["orientationCCWDegreesProvisional"])
        if rotation not in (0, 90, 180, 270):
            raise ValueError(f"Unsupported orientation for {page_id}: {rotation}")
        image = image.rotate(rotation, expand=True)
        if image.size != oriented_size(page["orientedSize"]):
            raise ValueError(f"Oriented dimensions differ for {page_id}: {image.size}")
        for block in page["reviewedBlocks"]:
            if block["type"] != "display-math":
                continue
            latex = validate_latex(block["latex"].strip())
            x, y, width, height = map(float, block["box"])
            if not all(map(math.isfinite, (x, y, width, height))) or min(width, height) <= 0:
                raise ValueError(f"Invalid crop on {page_id}, block {block['order']}.")
            if min(x, y) < 0 or x + width > 1.00001 or y + height > 1.00001:
                raise ValueError(f"Out-of-bounds crop on {page_id}, block {block['order']}.")
            # A small border preserves ascenders, fraction bars, and subscripts.
            margin_x, margin_y = max(width * 0.05, 0.004), max(height * 0.12, 0.004)
            bounds = (max(0, round((x - margin_x) * image.width)),
                      max(0, round((y - margin_y) * image.height)),
                      min(image.width, round((x + width + margin_x) * image.width)),
                      min(image.height, round((y + height + margin_y) * image.height)))
            crop = image.crop(bounds)
            if min(crop.size) < 8:
                raise ValueError(f"Crop too small on {page_id}, block {block['order']}.")
            sample_id = f"{page_id}-math-{int(block['order']):03d}"
            if len(latex) > 256:
                # The current decoder caps generation at 256 tokens. Long,
                # multi-line blocks need a separate segmentation strategy.
                skipped_long_labels.append(sample_id)
                continue
            # Obvious blank-page boxes occur in this first-pass annotation.
            # This conservative threshold catches blank ruled-paper crops;
            # other alignment errors still require human review.
            if ImageStat.Stat(crop.convert("L")).stddev[0] < 10:
                skipped_empty_crops.append(sample_id)
                continue
            relative = f"images/{sample_id}.png"
            crop.save(output / relative)
            records[splits[page_id]].append({
                "sampleId": sample_id, "pageId": page_id, "image": relative,
                "latex": latex, "sha256": image_sha256(output / relative),
                "sourceSha256": actual_sha, "annotationSha256": page["sha256"],
            })
    for split, rows in records.items():
        if not rows:
            raise ValueError(f"No math blocks in {split} split.")
        with (output / f"{split}.jsonl").open("w") as file:
            for row in rows:
                file.write(json.dumps(row, ensure_ascii=False) + "\n")
    summary = {
        "seed": seed,
        "pages": {split: sum(value == split for value in splits.values()) for split in records},
        "mathCrops": {split: len(rows) for split, rows in records.items()},
        "sourceHashesDifferingFromIndex": mismatched_sources,
        "skippedLabelsOver256Characters": skipped_long_labels,
        "skippedNearlyBlankCrops": skipped_empty_crops,
        "annotations": "first-pass-reviewed; not independently verified",
    }
    (output / "provenance.json").write_text(json.dumps(summary, indent=2) + "\n")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--images-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260926)
    parser.add_argument("--validation-pages", type=int, default=10)
    parser.add_argument("--test-pages", type=int, default=20)
    parser.add_argument("--allow-reencoded-originals", action="store_true")
    args = parser.parse_args()
    print(json.dumps(create_dataset(
        args.index, args.annotations, args.images_dir, args.output,
        seed=args.seed, validation_pages=args.validation_pages,
        test_pages=args.test_pages,
        allow_reencoded_originals=args.allow_reencoded_originals,
    ), indent=2))


if __name__ == "__main__":
    main()
