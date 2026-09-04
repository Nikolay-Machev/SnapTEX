from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from snaptex_ml.model import TrOCRFormulaRecognizer


def normalize_latex(value: str) -> str:
    value = re.sub(r"^\$\$?|\$\$?$", "", value.strip())
    value = value.replace(r"\left", "").replace(r"\right", "")
    return re.sub(r"\s+", "", value)


def edit_distance(left: str, right: str) -> int:
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


def evaluate(model_id: str, manifest: Path) -> dict[str, object]:
    recognizer = TrOCRFormulaRecognizer(model_id)
    records = [json.loads(line) for line in manifest.read_text().splitlines() if line]
    results = []
    total_edits = 0
    total_characters = 0
    exact_matches = 0
    for record in records:
        expected = normalize_latex(record["latex"])
        predicted_latex = recognizer.recognize(
            (manifest.parent / record["image"]).read_bytes()
        )
        predicted = normalize_latex(predicted_latex)
        edits = edit_distance(expected, predicted)
        total_edits += edits
        total_characters += len(expected)
        exact_matches += expected == predicted
        results.append(
            {
                "sampleId": record.get("sampleId"),
                "expected": record["latex"],
                "predicted": predicted_latex,
                "edits": edits,
                "exactMatch": expected == predicted,
            }
        )
    return {
        "model": model_id,
        "samples": len(records),
        "cer": total_edits / max(total_characters, 1),
        "exactMatch": exact_matches / max(len(records), 1),
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate baseline and SnapTEX models")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--model", action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = {"evaluations": [evaluate(model, args.manifest) for model in args.model]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    for result in report["evaluations"]:
        print(
            f"{result['model']}: CER {result['cer']:.2%}, "
            f"exact match {result['exactMatch']:.2%}"
        )


if __name__ == "__main__":
    main()
