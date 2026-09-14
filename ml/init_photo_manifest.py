from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from snaptex_ml.data_validation import SUPPORTED_IMAGE_SUFFIXES, image_sha256


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a labeling manifest for newly collected phone photographs"
    )
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    images_root = args.images.resolve()
    paths = sorted(
        path
        for path in images_root.rglob("*")
        if path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES
    )
    if not paths:
        raise ValueError(f"No supported images found in {images_root}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as output:
        for index, path in enumerate(paths, start=1):
            output.write(
                json.dumps(
                    {
                        "image": Path(
                            os.path.relpath(path, args.output.parent.resolve())
                        ).as_posix(),
                        "latex": "REPLACE_WITH_VERIFIED_LATEX",
                        "sampleId": f"phone-{index:04d}",
                        "sha256": image_sha256(path),
                        "source": "SnapTEX phone-photo collection",
                        "split": "untouched-photo-test",
                    }
                )
                + "\n"
            )
    print(f"Created {args.output} with {len(paths)} records to label")


if __name__ == "__main__":
    main()
