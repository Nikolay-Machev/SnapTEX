"""Checkpoint metadata and a compatibility bridge for un-migrated deployments."""

import json
import os
from pathlib import Path
import warnings


def template(profile):
    path = Path(__file__).parent / f"{profile}.json"
    if profile not in {"legacy", "phone-v05"}:
        raise ValueError("SNAPTEX_INFERENCE_PROFILE must be legacy or phone-v05")
    return json.loads(path.read_text())


def configure_loaded_model(model, processor):
    preserve_rgb = getattr(
        getattr(processor, "image_processor", None), "snaptex_preserve_rgb", None
    )
    if isinstance(preserve_rgb, bool):
        # Processor metadata is loaded for local and Hub checkpoints alike.
        return preserve_rgb
    # Existing read-only private mounts must still behave as before. Migration
    # writes these settings into the checkpoint; remove this bridge next version.
    settings = template(os.getenv("SNAPTEX_INFERENCE_PROFILE", "legacy"))
    model.generation_config.update(**settings["generation"])
    warnings.warn(
        "Using compatibility inference settings. Run configure_checkpoint.py to store generation and RGB settings in the checkpoint.",
        FutureWarning,
    )
    return settings["preserve_rgb"]
