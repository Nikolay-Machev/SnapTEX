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

The recommended development provider is the pretrained `tjoab/latex_finetuned` TrOCR model. It runs on your own CPU, Apple Silicon GPU, or CUDA GPU and requires no API key. The first run downloads the model weights from Hugging Face.

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

The local service defaults to automatic hardware selection. Override it with `SNAPTEX_DEVICE=cpu`, `mps`, or `cuda`, and override the checkpoint with `SNAPTEX_MODEL_ID`.

Run the checks with:

```bash
npm run typecheck
npm test
npm run build
```

Ten sanitized handwritten-equation fixtures and their expected transcriptions live in `tests/fixtures/equations`. With an API key configured, run `npm run eval:openai` for a live qualitative evaluation. Equivalent LaTeX can differ textually, so the report shows predictions beside the expected transcription instead of treating exact string equality as the sole quality metric.

With the local service running, use `npm run eval:local`. It evaluates all ten fixtures, computes normalized character error rate (CER), and writes a detailed ignored report under `evaluation-results/`. Incorrect predictions become the initial failure catalogue for improving preprocessing or assembling future training data.

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
