# Open-source model bakeoff

The failed `snaptex-trocr-v0.1` checkpoint is not a candidate. The bakeoff keeps
`tjoab/latex_finetuned` as the control and compares two specialized,
locally-runnable formula recognizers:

| CLI name | Model | Role |
| --- | --- | --- |
| `baseline` | `tjoab/latex_finetuned` | Current TrOCR control |
| `pix2tex` | LaTeX-OCR/pix2tex | ViT/ResNet + Transformer candidate |
| `pix2text` | Pix2Text `mfr-1.5` | Current Pix2Text MFR candidate |

Pix2Text uses its documented default ONNX backend. Set
`SNAPTEX_PIX2TEXT_BACKEND=pytorch` only when testing a complete local PyTorch
model directory; some upstream downloads do not contain the processor files
required by that backend.

All candidates receive the same SnapTEX-preprocessed image, manifest, expected
LaTeX, and crop coordinates. The report records normalized CER, exact matches,
invalid generations, latency, and every per-image prediction. Model downloads
remain in their upstream caches and weights remain outside Git.

## Run on a T4 runtime

Use a fresh benchmark environment so optional dependencies cannot destabilize
the production service:

```bash
cd ml
python -m venv .venv-benchmark
source .venv-benchmark/bin/activate
python -m pip install -r requirements-benchmark.txt
python benchmark_models.py \
  --models baseline pix2tex pix2text \
  --manifest ../tests/fixtures/equations/difficult-equations.json \
  --crop-mode both \
  --output ../evaluation-results/difficult-model-bakeoff.json
```

Then run all ten images using automatic localization:

```bash
python benchmark_models.py \
  --models baseline pix2tex pix2text \
  --manifest ../tests/fixtures/equations/manifest.json \
  --crop-mode automatic \
  --output ../evaluation-results/ten-image-model-bakeoff.json
```

The first run downloads model weights. Confirm CUDA is visible before starting:

```bash
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

## Promotion rule

Do not select a model from reputation or upstream benchmark results. Promote a
candidate only after the ten-image report shows:

1. lower average CER than the current baseline;
2. no increase in invalid outputs;
3. no decrease in exact matches; and
4. latency that remains acceptable for the private beta.

After a winner is known, add it behind the existing `FormulaRecognizer`
interface and repeat the integrated HTTP evaluation. Fine-tuning begins only
after this baseline decision, using a larger train/validation dataset while the
ten phone photographs remain an untouched test set.
