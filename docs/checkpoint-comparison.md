# Baseline versus SnapTEX checkpoint

This paired experiment compares `tjoab/latex_finetuned` with a specified SnapTEX
checkpoint on the same ten repository images. It uses the existing image
preprocessing, automatic localization, LaTeX normalization, and per-image CER
from `snaptex_ml.benchmark`. The images and their labels are fixed in
`tests/fixtures/equations/manifest.json` and must stay outside training.

On a machine with enough memory for both models (a Colab T4 works), from the
repository root:

```bash
cd ml
python -m pip install -r requirements.txt
python compare_checkpoints.py --candidate NikolayMachev/snaptex-aligned-2400
```

For a private checkpoint, set `HF_TOKEN` in the runtime's secret manager first.
Alternatively, pass `--candidate /path/to/checkpoint-450`. You can pass
`--manifest /path/to/fixed-manifest.json` for another independent test set.
The command writes `evaluation-results/checkpoint-comparison.json` and `.md`
at the repository root. Generated reports are excluded from Git; inspect the
results before committing a carefully reviewed report. The JSON contains the
label and prediction for every image, hashes of the manifest and image bytes,
and any raw invalid model output.

**Read the metrics carefully.** `meanSampleCer` is the unweighted mean of
per-image CER, so it can exceed 100%. An inference failure is assigned 100% CER
and counted separately; do not interpret its value as a measured edit distance.
Exact match compares normalized LaTeX strings, not mathematical equivalence.
Each image receives one diagnostic category in priority order: invalid output,
inference error, exact match, empty output, output shorter than half the target,
fraction mismatch, script mismatch, command mismatch, or other mismatch. These
categories help choose examples to inspect; they do not prove the cause of an
error. Avoid tuning on these ten held-out images and then presenting them as an
unbiased test set.

The private checkpoint and full 100-photo collection are not bundled with this
repository. The script does not publish a numerical result until the models have
actually been run on the fixed images.
