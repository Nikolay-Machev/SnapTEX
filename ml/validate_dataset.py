from __future__ import annotations

import argparse
from pathlib import Path

from snaptex_ml.data_validation import (
    assert_disjoint,
    assert_not_in_holdout,
    read_manifest,
)


ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate SnapTEX dataset manifests")
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--photo-test", type=Path)
    parser.add_argument(
        "--protected-fixtures",
        type=Path,
        default=ROOT / "tests" / "fixtures" / "equations",
    )
    args = parser.parse_args()

    splits = {
        "train": read_manifest(args.train.resolve()),
        "validation": read_manifest(args.validation.resolve()),
    }
    if args.photo_test is not None:
        splits["photo-test"] = read_manifest(args.photo_test.resolve())
    assert_disjoint(splits)
    assert_not_in_holdout(
        [*splits["train"], *splits["validation"]],
        args.protected_fixtures.resolve(),
    )
    summary = ", ".join(f"{name}={len(records)}" for name, records in splits.items())
    print(f"Dataset valid and disjoint: {summary}")


if __name__ == "__main__":
    main()
