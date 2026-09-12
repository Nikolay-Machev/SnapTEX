# SnapTEX

A full-stack web application that converts images of mathematical equations into clean LaTeX code. Users can upload an equation, generate editable LaTeX, preview the rendered result in real time, and copy it directly into Overleaf or any other LaTeX editor.

## Development

SnapTEX uses React Router Framework Mode, the current continuation of Remix, with TypeScript, Tailwind CSS, and KaTeX.

Requirements: Node.js 22.22 or newer.

```bash
npm install
npm run dev
```

The first implementation uses `MockRecognizer`, so no API key is required. Uploading any supported image returns a sample quadratic-formula transcription and exercises the complete upload-to-preview flow.

To use OpenAI vision, copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and change `RECOGNITION_PROVIDER` to `openai`. The mock remains the default so development and automated tests never make paid API calls accidentally.

## Free local recognition

The local provider runs either the pretrained `tjoab/latex_finetuned` baseline or your fine-tuned `snaptex-trocr-v0.1` checkpoint on your own CPU, Apple Silicon GPU, or CUDA GPU. It requires no API key.

Start the Python service:

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn snaptex_ml.app:app --reload
```

In another terminal, configure and start the web application:

```bash
cp .env.example .env
# Change RECOGNITION_PROVIDER to local in .env
npm run dev
```

Docker is also supported:

```bash
docker compose up recognition
```

The local service defaults to the public baseline and automatic hardware selection. After training, connect the SnapTEX model by starting the service from `ml/` with:

```bash
SNAPTEX_MODEL_ID=checkpoints/snaptex-trocr-v0.1 uvicorn snaptex_ml.app:app --reload
```

Then set `RECOGNITION_PROVIDER=snaptex` in the root `.env`. The browser, `/api/convert` route, validation, and preview need no model-specific changes. Verify the loaded checkpoint at `http://127.0.0.1:8000/health`; successful conversion responses identify it in `result.provider` as `snaptex:<checkpoint>`.

For Docker, mount and select the same checkpoint with:

```bash
SNAPTEX_MODEL_ID=/models/checkpoints/snaptex-trocr-v0.1 docker compose up --build recognition
```

The Compose service mounts `ml/checkpoints` read-only. Override hardware selection with `SNAPTEX_DEVICE=cpu`, `mps`, or `cuda`.

The local service automatically localizes equations before grayscale and contrast
normalization. It keeps the proven blue-ink detector and adds a local-contrast
detector for black pen, pencil, typed equations, and colored or ruled paper.
Users can drag over the photograph to provide a normalized manual crop whenever
automatic localization chooses the wrong region. The manual crop is validated by
both the web server and model service and always takes priority.

The blue-ink preprocessing experiment reduced average CER on the ten external
phone photographs from 487.60% to 72.82%; see `docs/evaluation-v0.1.md`. Continue
using the default `tjoab/latex_finetuned` baseline for the beta. The experimental
`snaptex-trocr-v0.1` checkpoint that scored 108.57% CER is not a release model.

Run the checks with:

```bash
npm run typecheck
npm test
npm run build
npm run model:test
```

For container deployment, operational limits, monitoring endpoints, privacy,
and the ten-image release gate, see `docs/operations.md`.

Ten sanitized handwritten-equation fixtures and their expected transcriptions live in `tests/fixtures/equations`. With an API key configured, run `npm run eval:openai` for a live qualitative evaluation. Equivalent LaTeX can differ textually, so the report shows predictions beside the expected transcription instead of treating exact string equality as the sole quality metric.

With the local service running, use `npm run eval:local`. It evaluates all ten fixtures through the integrated service, computes normalized character error rate (CER), and writes a detailed ignored report under `evaluation-results/`. Keep `SNAPTEX_MODEL_ID=tjoab/latex_finetuned` for this beta evaluation. Incorrect predictions become the initial failure catalogue for improving preprocessing or assembling future training data.

## Fine-tuning

The repository includes the complete `snaptex-trocr-v0.1` prototype pipeline, but not trained weights. It uses 1,000 verified-provenance, human-written MathWriting records: 900 official training samples and 100 official validation samples. Download and rasterize them deterministically:

```bash
cd ml
python prepare_mathwriting.py --download
```

Then fine-tune:

```bash
pip install -r requirements-train.txt
python train.py \
  --train data/mathwriting-1000/train.jsonl \
  --validation data/mathwriting-1000/validation.jsonl \
  --output checkpoints/snaptex-trocr-v0.1
```

That output directory is the runtime artifact. Keep it out of Git (model weights are large); the web pipeline reaches it through the local FastAPI service, selected by `SNAPTEX_MODEL_ID`.

Compare the baseline and fine-tuned checkpoints:

```bash
python evaluate_checkpoint.py \
  --manifest data/mathwriting-1000/validation.jsonl \
  --model tjoab/latex_finetuned \
  --model checkpoints/snaptex-trocr-v0.1 \
  --output ../evaluation-results/v0.1-validation.json
```

Fine-tuning data and checkpoints are intentionally ignored because they are large. The ten external evaluation fixtures must stay out of the training split. See `docs/model-card-snaptex-trocr-v0.1.md` and `THIRD_PARTY_DATA.md` for the exact experimental design and licensing limitation.

## Architecture

SnapTEX is initially structured as a React Router Framework Mode modular monolith. Image recognition is accessed through a provider-independent interface, allowing OpenAI or Claude to be replaced later by the native SnapTEX model.

See [Architecture](docs/architecture.md) for the complete design.
