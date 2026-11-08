# Evaluation

## Recorded history

These are historical experiments, not a new evaluation of this refactor. Results
from different datasets and metric versions must not be compared directly.

| Experiment | Dataset | Mean normalized CER | Exact / failures | Interpretation |
| --- | --- | ---: | --- | --- |
| Baseline, full photo | Ten phone images | 487.60% | 0/10 usable | Localization required |
| Baseline, fixed crop | Same ten | 610.83% | 0/10 usable | Fixed rectangles amplified noise |
| Baseline, tight blue-ink crop | Same ten, early metric | 72.82% | Rendered review, not exact count | Early localization result |
| Baseline, revised evaluator | Ten images | 80.44% → 70.79% | 2/10 → 3/10 exact; 3 failures | Metric changed; predictions unchanged |
| Baseline, automatic crop | Three difficult images | 100.00% | 3 failures | Complex notation remains difficult |
| Baseline, manual crop | Same three | 101.60% | 1 failure | More valid output did not mean accuracy |
| Starting / aligned-2400 | 300-sample MathWriting validation | 16.82% / 16.67% | 46.33% / 47.33% exact | Small improvement on that validation split |

The ten repository images are a small regression set, not a representative final
test. Keep them outside training. Do not tune on a test set and then claim it
provides an unbiased generalization score. Phone-pilot and MathWriting splits
are distinct. Private checkpoints and original full-page collections are not
bundled with the repository.

## One CLI for every recognizer

From the repository root, install `ml/requirements.txt` in a Python environment:

```bash
python ml/evaluate.py --model baseline --manifest tests/fixtures/equations/manifest.json
python ml/evaluate.py --model baseline --model /path/to/checkpoint --baseline baseline \
  --manifest /path/to/test.jsonl --output evaluation-results/comparison.json
```

`--model` may be repeated. It accepts a Hub ID, a local checkpoint, `baseline`,
`pix2tex`, `pix2text`, or the full HTTP URL of a running Node `/api/convert`
endpoint. Optional models need `ml/requirements-benchmark.txt` in an isolated
environment; Pix2Text defaults to ONNX. Set `SNAPTEX_PIX2TEXT_BACKEND=pytorch`
only with a complete compatible local model directory.

To compare the integrated local and OpenAI providers, run two private web
instances configured for the respective providers, then use one command:

```bash
python ml/evaluate.py \
  --model http://127.0.0.1:3000/api/convert \
  --model http://127.0.0.1:3001/api/convert \
  --baseline http://127.0.0.1:3000/api/convert \
  --manifest tests/fixtures/equations/manifest.json --request-interval 6.1
```

The HTTP recognizer exercises Node validation, rate limits, provider selection
and inference. OpenAI calls cost money and consume the configured per-client and
global quotas; the evaluator never bypasses or automatically retries them. Quota
errors remain visible failures in the report. The 6.1-second interval spaces out
calls for the default ten-per-minute budget; ensure the daily quota is sufficient
before deliberately running a larger paid experiment. No OpenAI comparison is
claimed until an actual report has been reviewed. Use `HF_TOKEN` for private Hub
checkpoints; never include secrets in endpoint URLs or committed reports.

## Contracts and metrics

The manifest is either a JSON array of `{file, expectedLatex, crop?}` or JSONL
records of `{image, latex, sampleId?}`. Image paths are relative to the manifest.
Crops use normalized x/y/width/height. The evaluator rejects empty manifests,
duplicate paths, missing files and invalid crops before running models.

Use `--crop-mode automatic`, `manual`, or `both`. Manual mode evaluates only
records with crops; `both` skips manual mode if none exist. Models run sequentially
so two GPU models do not have to fit in memory at once.

The sole metric implementation is `snaptex_ml/benchmark.py`. It removes outer
math dollars, whitespace, `\left`/`\right`, and braces around one-character
scripts. It does not establish mathematical equivalence or normalize arbitrary
Greek glyph commands. CER is the **mean of per-image edit-distance/reference-length
ratios**, can exceed 100%, and differs from corpus-weighted CER used by some
notebooks. Failures receive a sentinel CER of 1.0 and a separate error count;
that sentinel is not a measured edit distance. Exact match uses normalized text.

The JSON records every prediction, error, rejected raw output where available,
latency, the resolved provider/model identity, manifest/image hashes, heuristic
error categories, rankings and paired
per-image CER differences. A Markdown summary is written beside it. Heuristic
categories are diagnostics, not proof of an error's cause. The historical three
rejected ten-image cases were unbalanced generations on Schrödinger,
Black–Scholes and Shannon-entropy expressions. Diagnostic raw output remains
local: Python's `SNAPTEX_DIAGNOSTICS=true` is for private debugging only.

## Regression gate and promotion

```bash
npm run eval:gate
npm run eval:crops
```

These delegate to the same Python CLI through Node HTTP. The gate exits nonzero
when mean CER exceeds 0.80 or any inference fails. Set the running Node provider
to the intended real model; a mock run is only a plumbing test. General CLI gates
are `--max-cer` and `--max-errors`. Reports go under ignored `evaluation-results/`.

Promote a model only after reviewed comparisons show lower CER, no increase in
invalid outputs, no decrease in exact matches and acceptable latency. Keep a
fresh held-out set for final evaluation after using validation data for choices.
