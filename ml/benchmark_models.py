from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

from snaptex_ml.benchmark import (
    MODEL_FACTORIES,
    evaluate_model,
    load_fixtures,
    rank_results,
    result_as_dict,
)


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = ROOT / "tests" / "fixtures" / "equations" / "manifest.json"
DEFAULT_OUTPUT = ROOT / "evaluation-results" / "model-bakeoff.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare local formula-recognition models on one fixed manifest."
    )
    parser.add_argument(
        "--models",
        nargs="+",
        choices=sorted(MODEL_FACTORIES),
        default=list(MODEL_FACTORIES),
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--crop-mode",
        choices=("automatic", "manual", "both"),
        default="both",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="List candidates without loading their weights.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.list_models:
        print("\n".join(sorted(MODEL_FACTORIES)))
        return

    manifest_path = args.manifest.resolve()
    fixtures = load_fixtures(manifest_path)
    crop_modes = (
        ["automatic", "manual"] if args.crop_mode == "both" else [args.crop_mode]
    )
    results = []
    for model_name in args.models:
        print(f"\nLoading {model_name}...")
        recognizer = MODEL_FACTORIES[model_name]()
        for crop_mode in crop_modes:
            eligible_fixtures = (
                fixtures
                if crop_mode == "automatic"
                else [fixture for fixture in fixtures if fixture.crop is not None]
            )
            if not eligible_fixtures:
                print(f"Skipping {model_name}/{crop_mode}: manifest has no crops.")
                continue
            print(
                f"Evaluating {model_name}/{crop_mode} "
                f"on {len(eligible_fixtures)} images..."
            )
            result = evaluate_model(
                recognizer,
                eligible_fixtures,
                manifest_path.parent,
                crop_mode,
            )
            results.append(result)
            print(
                f"CER {result.average_cer * 100:.2f}% | "
                f"exact {result.exact_matches}/{len(result.results)} | "
                f"errors {result.error_count} | "
                f"{result.average_latency_seconds:.2f}s/image"
            )

    ranked = rank_results(results)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "manifest": str(manifest_path),
        "ranking": [
            {
                "rank": index,
                "model": result.model,
                "cropMode": result.crop_mode,
                "averageCer": result.average_cer,
                "exactMatches": result.exact_matches,
                "errorCount": result.error_count,
                "averageLatencySeconds": result.average_latency_seconds,
            }
            for index, result in enumerate(ranked, start=1)
        ],
        "results": [result_as_dict(result) for result in results],
    }
    output_path = args.output.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n")
    if ranked:
        print(f"\nBest result: {ranked[0].model}/{ranked[0].crop_mode}")
    print(f"Report: {output_path}")


if __name__ == "__main__":
    main()
