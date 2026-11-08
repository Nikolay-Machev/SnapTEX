"""Evaluate checkpoints or Node providers on one fixed, audited manifest."""

from __future__ import annotations
import argparse
from collections import Counter
from dataclasses import asdict, replace
from datetime import datetime, timezone
import gc
import hashlib
import json
import math
from pathlib import Path

from snaptex_ml.benchmark import (
    MODEL_FACTORIES,
    HttpRecognizer,
    category,
    evaluate_model,
    load_fixtures,
    rank_results,
)
from snaptex_ml.model import TrOCRFormulaRecognizer

ROOT = Path(__file__).resolve().parent.parent


def evaluate(model: str, manifest: Path, crop_mode="automatic", interval=0):
    fixtures = load_fixtures(manifest)
    if crop_mode == "manual":
        fixtures = [row for row in fixtures if row.crop is not None]
    if not fixtures:
        raise ValueError("No eligible fixtures for this crop mode")
    if model.startswith(("http://", "https://")):
        recognizer = HttpRecognizer(model, interval=interval)
    else:
        recognizer = (
            MODEL_FACTORIES[model]()
            if model in MODEL_FACTORIES
            else TrOCRFormulaRecognizer(model)
        )
    try:
        return evaluate_model(recognizer, fixtures, manifest.parent, crop_mode)
    finally:
        if isinstance(recognizer, HttpRecognizer):
            recognizer.close()
        del recognizer
        gc.collect()
        # Release cached CUDA allocations between checkpoints, not per image.
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def report(models, manifest, baseline=None, crop_mode="automatic", interval=0):
    fixtures = load_fixtures(manifest)
    modes = ["automatic", "manual"] if crop_mode == "both" else [crop_mode]
    evaluations = []
    ranking_results = []
    for model in models:
        for mode in modes:
            if mode == "manual" and not any(row.crop for row in fixtures):
                if crop_mode == "manual":
                    raise ValueError("Manifest has no manual crops")
                continue
            result = evaluate(model, manifest, mode, interval)
            ranking_results.append(replace(result, model=model))
            row = asdict(result)
            row["resolved_model"] = result.model
            for prediction in row["results"]:
                prediction["category"] = category(
                    prediction["expected_latex"],
                    prediction["predicted_latex"],
                    prediction["error"],
                    prediction["raw_latex"],
                )
            row["category_counts"] = dict(
                Counter(item["category"] for item in row["results"])
            )
            row["model"] = model
            evaluations.append(row)
            print(
                f"{model}/{mode}: CER {result.average_cer:.2%}, exact {result.exact_matches}/{len(result.results)}, errors {result.error_count}",
                flush=True,
            )
    pairs = []
    if baseline:
        for candidate in evaluations:
            if candidate["model"] == baseline:
                continue
            control = next(
                row
                for row in evaluations
                if row["model"] == baseline
                and row["crop_mode"] == candidate["crop_mode"]
            )
            rows = [
                {
                    "file": a["file"],
                    "baseline_cer": a["cer"],
                    "candidate_cer": b["cer"],
                    "delta_cer": b["cer"] - a["cer"],
                }
                for a, b in zip(control["results"], candidate["results"])
            ]
            pairs.append(
                {
                    "baseline": baseline,
                    "candidate": candidate["model"],
                    "crop_mode": candidate["crop_mode"],
                    "samples": rows,
                    "improved": sum(row["delta_cer"] < 0 for row in rows),
                    "worsened": sum(row["delta_cer"] > 0 for row in rows),
                }
            )
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metric": "mean per-image normalized CER; inference failures assigned 1.0; exact matches are normalized string equality",
        "manifest_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
        "image_sha256": {
            row.file: hashlib.sha256(
                (manifest.parent / row.file).read_bytes()
            ).hexdigest()
            for row in fixtures
        },
        "evaluations": evaluations,
        "paired_differences": pairs,
        "ranking": [
            {
                "model": row.model,
                "crop_mode": row.crop_mode,
                "average_cer": row.average_cer,
            }
            for row in rank_results(ranking_results)
        ],
    }


def markdown(payload):
    lines = [
        "# Evaluation",
        "",
        payload["metric"],
        "",
        f"Manifest SHA-256: `{payload['manifest_sha256']}`",
        "",
        "| Model | Crop | Mean CER | Exact | Errors | Seconds/image |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
    ]
    for row in payload["evaluations"]:
        lines.append(
            f"| {row['model']} | {row['crop_mode']} | {row['average_cer']:.2%} | {row['exact_matches']}/{len(row['results'])} | {row['error_count']} | {row['average_latency_seconds']:.2f} |"
        )
    for pair in payload["paired_differences"]:
        lines += [
            "",
            f"## {pair['candidate']} versus {pair['baseline']} ({pair['crop_mode']})",
            "",
            "| Image | Baseline CER | Candidate CER | Change |",
            "| --- | ---: | ---: | ---: |",
        ]
        for row in pair["samples"]:
            lines.append(
                f"| {row['file']} | {row['baseline_cer']:.2%} | {row['candidate_cer']:.2%} | {row['delta_cer']:+.2%} |"
            )
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        action="append",
        required=True,
        help="Hub ID, local checkpoint, baseline/pix2tex/pix2text, or full Node /api/convert URL",
    )
    parser.add_argument(
        "--baseline", help="One of --model, used for paired differences"
    )
    parser.add_argument(
        "--manifest", type=Path, default=ROOT / "tests/fixtures/equations/manifest.json"
    )
    parser.add_argument(
        "--crop-mode", choices=["automatic", "manual", "both"], default="automatic"
    )
    parser.add_argument(
        "--output", type=Path, default=ROOT / "evaluation-results/evaluation.json"
    )
    parser.add_argument(
        "--request-interval",
        type=float,
        default=0,
        help="Seconds between HTTP calls; never retries quota errors",
    )
    parser.add_argument("--max-cer", type=float, default=float("inf"))
    parser.add_argument("--max-errors", type=int, default=2**31 - 1)
    args = parser.parse_args(argv)
    if len(set(args.model)) != len(args.model) or (
        args.baseline and args.baseline not in args.model
    ):
        parser.error("Models must be unique; baseline must appear in --model")
    if (
        not math.isfinite(args.request_interval)
        or math.isnan(args.max_cer)
        or args.request_interval < 0
        or args.max_cer < 0
        or args.max_errors < 0
    ):
        parser.error("Intervals and thresholds must be nonnegative")
    payload = report(
        args.model,
        args.manifest.resolve(),
        args.baseline,
        args.crop_mode,
        args.request_interval,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    args.output.with_suffix(".md").write_text(markdown(payload))
    return int(
        any(
            row["average_cer"] > args.max_cer or row["error_count"] > args.max_errors
            for row in payload["evaluations"]
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
