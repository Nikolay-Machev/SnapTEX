"""Store inference settings in an existing local checkpoint without copying weights."""

import argparse
import json
from pathlib import Path
from snaptex_ml.checkpoint_settings import template


def configure(checkpoint: Path, profile: str):
    if not (checkpoint / "config.json").is_file():
        raise ValueError("Choose an extracted checkpoint folder containing config.json")
    settings = template(profile)
    generation = checkpoint / "generation_config.json"
    payload = json.loads(generation.read_text()) if generation.exists() else {}
    payload.update(settings["generation"])
    if "max_new_tokens" in settings["generation"]:
        payload.pop("max_length", None)
    preprocessing = checkpoint / "preprocessor_config.json"
    processor_settings = (
        json.loads(preprocessing.read_text()) if preprocessing.exists() else {}
    )
    processor_settings["snaptex_preserve_rgb"] = settings["preserve_rgb"]
    for path, content in [
        (generation, payload),
        (preprocessing, processor_settings),
    ]:
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(content, indent=2) + "\n")
        temporary.replace(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--profile", choices=["legacy", "phone-v05"], required=True)
    args = parser.parse_args()
    configure(args.checkpoint, args.profile)
    print(
        "Checkpoint settings saved; weights unchanged. Remove SNAPTEX_INFERENCE_PROFILE from this deployment."
    )
