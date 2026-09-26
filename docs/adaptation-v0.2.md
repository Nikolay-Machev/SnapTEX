# SnapTEX domain adaptation v0.2

> Historical plan: the later phone-crop pilot supersedes the proposed role of
> all 100 photographs as an untouched test set. See `docs/phone-training.md`.

## Objective

Adapt the winning open-free formula recognizer to real phone photographs without
repeating v0.1's catastrophic quality regression. The original ten photographs
remain a protected historical test. A separately collected 100-photo set is the
untouched release test.

## Data roles

| Split | Target size | Permitted use |
| --- | ---: | --- |
| MathWriting train | 2,400 | Weight updates |
| MathWriting validation | 300 | Early stopping and checkpoint selection |
| Original phone fixtures | 10 | Historical comparison only |
| New phone photographs | 100+ | One final release evaluation |

The MathWriting subset is complexity-enriched but remains human-written. The
training transform simulates colored and ruled paper, black/blue/pencil-like
strokes, rotation, uneven illumination, contrast loss, blur, edge cropping, and
JPEG compression. Validation and test images are never augmented.

## Collecting the 100-photo test

Use many writers, pens, pencils, paper colors, phones, distances, and lighting
conditions. Aim for roughly balanced coverage of simple, medium, and complex
expressions. Remove EXIF metadata before sharing or committing any image. Keep
these photographs under `ml/data/phone-photo-100`, which Git ignores by default.

Initialize and label the manifest using the commands in `ml/data/README.md`.
Every label must be transcribed from the intended equation and manually checked;
do not use a candidate model's prediction as ground truth.

## Conservative first run

Replace `WINNING_MODEL` only after the fixed bakeoff is complete:

```bash
cd ml
python validate_dataset.py \
  --train data/mathwriting-2700/train.jsonl \
  --validation data/mathwriting-2700/validation.jsonl \
  --photo-test data/phone-photo-100/test.jsonl

python train.py \
  --model WINNING_MODEL \
  --train data/mathwriting-2700/train.jsonl \
  --validation data/mathwriting-2700/validation.jsonl \
  --output checkpoints/snaptex-domain-v0.2 \
  --epochs 3 \
  --batch-size 4 \
  --gradient-accumulation 4 \
  --learning-rate 1e-5 \
  --freeze-encoder
```

This first stage freezes the vision encoder, masks padding labels with `-100`,
clips gradients, warms up for 5%, uses four-beam validation generation, stops
early, and restores the checkpoint with the lowest validation CER. Only attempt
an unfrozen run after this stage beats the pretrained model on validation.

## Acceptance

Compare the pretrained winner and adapted checkpoint on the 100 untouched
photographs exactly once after configuration choices are frozen. Record CER,
exact match, invalid-output rate, render success, and latency. Do not promote the
adapted checkpoint unless it improves CER without increasing invalid output.
