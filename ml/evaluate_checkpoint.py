"""Compare checkpoints on a labeled manifest without aborting on failures."""

from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path

from snaptex_ml.benchmark import Fixture, evaluate_model
from snaptex_ml.model import TrOCRFormulaRecognizer


def evaluate(model_id: str, manifest: Path) -> dict:
    records = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
    if not records:
        raise ValueError("The test manifest is empty.")
    fixtures = [Fixture(file=row["image"], expected_latex=row["latex"]) for row in records]
    model = TrOCRFormulaRecognizer(model_id)
    result = evaluate_model(model, fixtures, manifest.parent, "automatic")
    return {
        "model": model_id,
        "meanSampleCer": result.average_cer,
        "exactMatches": result.exact_matches,
        "failedPredictions": result.error_count,
        "samples": [
            {**asdict(prediction), "sampleId": row.get("sampleId")}
            for prediction, row in zip(result.results, records)
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--model", action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = args.manifest.resolve()
    report = {
        "manifestSha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
        "metric": "mean per-sample normalized CER; failed predictions assigned 1.0",
        "evaluations": [evaluate(model, manifest) for model in args.model],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    for result in report["evaluations"]:
        print(f"{result['model']}: mean CER {result['meanSampleCer']:.2%}, "
              f"exact {result['exactMatches']}/{len(result['samples'])}, "
              f"failed {result['failedPredictions']}")


if __name__ == "__main__":
    main()
