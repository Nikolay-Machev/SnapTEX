"""Run a paired, fixed-fixture comparison of two TrOCR checkpoints."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from snaptex_ml.benchmark import evaluate_model, load_fixtures, normalize_latex
from snaptex_ml.model import DEFAULT_MODEL_ID, TrOCRFormulaRecognizer


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = ROOT / "tests/fixtures/equations/manifest.json"


def category(expected: str, predicted: str | None, error: str | None,
             raw_invalid_output: str | None = None) -> str:
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


def compare(manifest: Path, baseline: str, candidate: str) -> dict:
    fixtures = load_fixtures(manifest)
    if not fixtures:
        raise ValueError("The test manifest is empty")
    if len({item.file for item in fixtures}) != len(fixtures):
        raise ValueError("The test manifest has duplicate image paths")
    images = [manifest.parent / item.file for item in fixtures]
    for image in images:
        if not image.is_file():
            raise FileNotFoundError(image)
    manifest_hash = hashlib.sha256(manifest.read_bytes()).hexdigest()
    image_hashes = {item.file: hashlib.sha256(image.read_bytes()).hexdigest()
                    for item, image in zip(fixtures, images)}
    results = []
    for model_id in (baseline, candidate):
        print(f"Loading {model_id}...", flush=True)
        recognizer = TrOCRFormulaRecognizer(model_id)
        results.append(evaluate_model(recognizer, fixtures, manifest.parent, "automatic"))
    evaluations = []
    for result in results:
        categories = [category(row.expected_latex, row.predicted_latex, row.error, row.raw_latex)
                      for row in result.results]
        evaluations.append({
            "model": result.model,
            "meanSampleCer": result.average_cer,
            "exactMatches": result.exact_matches,
            "inferenceFailures": result.error_count,
            "categoryCounts": dict(sorted(Counter(categories).items())),
            "samples": [
                {"file": row.file, "expected": row.expected_latex,
                 "predicted": row.predicted_latex, "rawInvalidOutput": row.raw_latex,
                 "error": row.error, "cer": row.cer, "category": tag}
                for row, tag in zip(result.results, categories)
            ],
        })
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "metric": "mean of per-image normalized character error rates; inference failures assigned CER 1.0",
        "cropMode": "automatic",
        "manifestSha256": manifest_hash,
        "imageSha256": image_hashes,
        "evaluations": evaluations,
    }


def markdown(report: dict) -> str:
    rows = report["evaluations"]
    lines = ["# Paired checkpoint evaluation", "",
             f"Manifest SHA-256: `{report['manifestSha256']}`", "",
             f"Metric: {report['metric']}. Same images and automatic crop for both models.", "",
             "| Model | Mean sample CER | Exact | Failed inference |", "| --- | ---: | ---: | ---: |"]
    count = len(report["imageSha256"])
    for row in rows:
        lines.append(f"| `{row['model']}` | {row['meanSampleCer']:.2%} | "
                     f"{row['exactMatches']}/{count} | {row['inferenceFailures']}/{count} |")
    lines += ["", "## Per-image outcomes", "",
              "| Image | Baseline category (CER) | Candidate category (CER) |",
              "| --- | --- | --- |"]
    for a, b in zip(rows[0]["samples"], rows[1]["samples"]):
        lines.append(f"| {a['file']} | {a['category']} ({a['cer']:.2%}) | "
                     f"{b['category']} ({b['cer']:.2%}) |")
    lines += ["", "Categories are string heuristics, not a semantic analysis of LaTeX.",
              "Inspect the JSON for predictions, labels, errors, and image hashes. "
              "This small regression set does not measure generalization.", ""]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--baseline", default=DEFAULT_MODEL_ID)
    parser.add_argument("--candidate", required=True, help="Hub ID or local checkpoint directory")
    parser.add_argument("--output", type=Path, default=ROOT / "evaluation-results/checkpoint-comparison.json")
    args = parser.parse_args()
    if args.baseline == args.candidate:
        parser.error("baseline and candidate must be different checkpoints")
    report = compare(args.manifest.resolve(), args.baseline, args.candidate)
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    output.with_suffix(".md").write_text(markdown(report))
    print(f"Reports: {output} and {output.with_suffix('.md')}")


if __name__ == "__main__":
    main()
