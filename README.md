# SnapTEX

> **Status: active development — research prototype, not production-ready.**
>
> The end-to-end application, local inference service, evaluation tooling, and
> document assembly pipeline are working. Recognition quality is still being
> improved, especially for dense or complex handwritten notation and full-page
> documents.

SnapTEX is a full-stack application for converting photographed handwritten
mathematics into editable LaTeX. The project is designed around a
provider-independent recognition layer so model experiments can be evaluated
without rewriting the web application.

It currently supports two workflows:

- **Equation mode** converts one selected mathematical expression into editable
  LaTeX with a rendered preview.
- **Document mode** accepts ordered page photographs, detects multiple
  mathematical regions, preserves page order, and assembles an editable `.tex`
  document that can be copied or downloaded for use in Overleaf or another
  LaTeX editor.

## Project status

SnapTEX is being developed as both a software-engineering project and an applied
ML experiment. The application shell is usable, but the recognition system is
still experimental.

### Working now

- image upload, validation, equation editing, KaTeX preview, copy, and `.tex`
  download;
- provider-independent recognition interface with mock, OpenAI, local baseline,
  and experimental SnapTEX model providers;
- local Python/FastAPI inference service with CPU, Apple Silicon, and CUDA device
  selection;
- automatic equation localization plus an optional manual-crop fallback;
- preprocessing for blue ink, black ink, pencil, typed equations, and varied
  paper backgrounds;
- multi-page document ingestion with ordered math-region detection and LaTeX
  assembly;
- reproducible local evaluation using normalized character error rate (CER),
  fixture manifests, diagnostics, and model-comparison tooling;
- Docker support and automated TypeScript/Python checks.

### Current limitations

- The current local recognizer is an **image-to-formula model**, not a general
  handwriting/document model.
- Complex notation can still produce incorrect or structurally invalid LaTeX.
- Document mode recognizes mathematical regions but does **not yet recognize
  handwritten prose, headings, diagrams, or tables**.
- The current phone-photo evaluation set is deliberately small and is used as a
  regression set, not as evidence of production-level accuracy.
- `snaptex-trocr-v0.1` remains a failed historical experiment. The newer
  `snaptex-aligned-2400` checkpoint is available for integration testing through
  Hugging Face, while the public pretrained baseline remains the code default.

See [`docs/document-pipeline.md`](docs/document-pipeline.md) and
[`docs/evaluation-v0.2.md`](docs/evaluation-v0.2.md) for the current failure
modes and evaluation details.

## Current roadmap

The next development stages are:

1. benchmark the current baseline against alternative mathematical-recognition
   models on the fixed phone-photo set;
2. run the protected v0.2 domain-adaptation experiment on complexity-enriched
   handwritten mathematics;
3. promote a native SnapTEX checkpoint only if it beats the baseline on untouched
   evaluation data;
4. expand document mode with page-layout detection and prose handwriting OCR;
5. evaluate full-page reconstruction on a separately annotated page-level test
   set.

The roadmap is intentionally evaluation-gated: model changes are treated as
experiments and are not promoted solely because training loss improves.

## Evaluation snapshot

The ten external phone photographs are kept outside training and used as a
small regression set.

Early preprocessing work showed that tight equation localization was necessary
for phone photographs: the v0.1 blue-ink localization experiment reduced
average normalized CER from **487.60%** on full photographs to **72.82%**.

The newer evaluator also normalizes equivalent one-character superscript and
subscript bracing. Under that corrected metric, the current ten-image baseline
records **70.79% average CER**, **3/10 normalized exact matches**, and **3/10
rejected generations**. The rejected cases are unbalanced model generations on
more complex expressions, so these numbers are treated as diagnostics rather
than a claim of production accuracy.

Detailed reports:

- [`docs/evaluation-v0.1.md`](docs/evaluation-v0.1.md) — localization experiment;
- [`docs/evaluation-v0.2.md`](docs/evaluation-v0.2.md) — corrected metric,
  rejected-output diagnostics, and crop comparison;
- [`docs/model-bakeoff.md`](docs/model-bakeoff.md) — reproducible model comparison;
- [`docs/model-card-snaptex-trocr-v0.1.md`](docs/model-card-snaptex-trocr-v0.1.md)
  — first experimental checkpoint.

## Tech stack

**Web application**

- TypeScript
- React Router Framework Mode
- React
- Tailwind CSS
- KaTeX
- Zod
- Vitest

**ML / inference**

- Python
- FastAPI / Uvicorn
- Hugging Face vision-to-text models
- PyTorch-based local inference
- custom image localization and preprocessing
- CER-based evaluation and regression fixtures

**Infrastructure**

- Docker / Docker Compose
- provider-independent recognition interface
- separate web and local-model services

## Quick start

Requirements: **Node.js 22.22+**.

```bash
npm install
npm run dev
```

The default development configuration uses `MockRecognizer`, so the complete
upload-to-preview flow works without an API key or local model.

### Run the local recognizer

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn snaptex_ml.app:app --reload
```

In another terminal:

```bash
cp .env.example .env
# Set RECOGNITION_PROVIDER=local in .env
npm run dev
```

The code-level fallback is `tjoab/latex_finetuned`. The supplied `.env.example`
selects the private `NikolayMachev/snaptex-aligned-2400` checkpoint; add a
read-only `HF_TOKEN` to `.env` before starting local inference. Device selection
automatically supports CPU, Apple Silicon (`mps`), and CUDA.

Docker is also supported:

```bash
docker compose up recognition
```

## Recognition providers

SnapTEX keeps recognition behind a common interface so the frontend and document
pipeline do not depend on a specific model.

- `mock` — deterministic development/testing provider;
- `openai` — optional vision provider for comparison;
- `local` — current pretrained local baseline;
- `snaptex` — experimental native checkpoint selected with `SNAPTEX_MODEL_ID`.

To run the current hosted SnapTEX checkpoint:

```bash
cd ml
HF_TOKEN=hf_your_read_token \
SNAPTEX_MODEL_ID=NikolayMachev/snaptex-aligned-2400 \
  uvicorn snaptex_ml.app:app --reload
```

Then set `RECOGNITION_PROVIDER=snaptex` in the root `.env`.

For Docker, put `HF_TOKEN` and `SNAPTEX_MODEL_ID` in the root `.env`, then run:

```bash
docker compose up --build recognition
```

The checkpoint weights are versioned on Hugging Face rather than GitHub:
[`NikolayMachev/snaptex-aligned-2400`](https://huggingface.co/NikolayMachev/snaptex-aligned-2400).
The repository is currently private, so deployments require a Hugging Face read
token. Never commit that token or a populated `.env` file.

The browser, `/api/convert` route, validation, and preview do not require
model-specific changes.

## Document mode

Document mode accepts up to 20 page images, preserves upload order, detects
multiple candidate regions on each page through `/recognize-page`, and assembles
ordered blocks into a complete `.tex` document.

The current local formula model returns mathematical regions only. Handwritten
prose is omitted with an explicit `TEXT_OCR_UNAVAILABLE` warning rather than
silently pretending to reconstruct text it cannot recognize.

See [`docs/document-pipeline.md`](docs/document-pipeline.md) for the interface and
planned full-page model stages.

## Model development

The repository contains the full `snaptex-trocr-v0.1` prototype training and
evaluation pipeline, but trained weights are intentionally excluded from Git.
The experiment uses 1,000 verified-provenance MathWriting records: 900 training
samples and 100 validation samples.

Prepare the data:

```bash
cd ml
python prepare_mathwriting.py --download
```

Train the prototype:

```bash
pip install -r requirements-train.txt
python train.py \
  --train data/mathwriting-1000/train.jsonl \
  --validation data/mathwriting-1000/validation.jsonl \
  --output checkpoints/snaptex-trocr-v0.1
```

Compare the pretrained baseline and experimental checkpoint:

```bash
python evaluate_checkpoint.py \
  --manifest data/mathwriting-1000/validation.jsonl \
  --model tjoab/latex_finetuned \
  --model checkpoints/snaptex-trocr-v0.1 \
  --output ../evaluation-results/v0.1-validation.json
```

The first fine-tuned checkpoint did not beat the baseline and is retained as an
experimental result rather than presented as a successful release model. The
next protected adaptation experiment is documented in
[`docs/adaptation-v0.2.md`](docs/adaptation-v0.2.md).

The aligned-loss 2,400-sample experiment is stored separately on Hugging Face as
`NikolayMachev/snaptex-aligned-2400`. On its 300-sample validation split it
recorded **16.67% CER** and **47.33% exact match**, compared with **16.82% CER**
and **46.33% exact match** for the starting checkpoint. This is a narrow
improvement, so it remains an experimental integration checkpoint rather than a
production-quality release.

## Verification

Run the main checks with:

```bash
npm run typecheck
npm test
npm run build
npm run model:test
```

Useful evaluation commands include:

```bash
npm run eval:local
npm run eval:models -- --list-models
npm run eval:crops
```

Ten sanitized handwritten-equation fixtures and their expected transcriptions
live in `tests/fixtures/equations`. Evaluation reports are written locally and
kept separate from training data.

## Architecture and documentation

SnapTEX is structured as a React Router modular monolith for the web layer plus a
separate local recognition service. Recognition is accessed through a
provider-independent interface so model changes can be tested without coupling
them to the UI.

Further documentation:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/operations.md`](docs/operations.md)
- [`docs/document-pipeline.md`](docs/document-pipeline.md)
- [`docs/adaptation-v0.2.md`](docs/adaptation-v0.2.md)
- [`THIRD_PARTY_DATA.md`](THIRD_PARTY_DATA.md)
