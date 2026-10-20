# Phone v0.5 private demo

The existing web app supports equation upload/crop, editable LaTeX, KaTeX preview,
manual illustration crops, and an Overleaf ZIP containing main.tex and figures.
This profile connects those features to the privately stored v0.5 phone model.
It is an experimental transcription aid; review every equation.

## Restore the model

Extract the verified `snaptex-phone-v0.5-retrained-backup.zip` on your own machine.
Place the resulting folder at `ml/checkpoints/snaptex-phone-v0.5-retrained/`.
That directory must directly contain config.json, model.safetensors, processor /
tokenizer files, and generation_config.json. Do not commit the archive or weights.
The code alone cannot recreate the trained checkpoint.

In the repository's `.env`, set:

```dotenv
RECOGNITION_PROVIDER=local
LOCAL_RECOGNITION_URL=http://127.0.0.1:8000
SNAPTEX_MODEL_ID=/models/checkpoints/snaptex-phone-v0.5-retrained
SNAPTEX_INFERENCE_PROFILE=phone-v05
SNAPTEX_DEVICE=cpu
SNAPTEX_MAX_CONCURRENCY=1
```

These model paths are for Docker Compose. For a Python service started outside
Docker, use the absolute host path to the same checkpoint folder instead.
Compose overrides LOCAL_RECOGNITION_URL with its internal recognition hostname.
CPU is a portable starting point; latency needs measurement on the target host.
Do not set cuda unless the container has a working GPU runtime.

```bash
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8000/ready
```

Open http://localhost:3000. The readiness response must identify the v0.5 folder,
not tjoab/latex_finetuned. Missing local weights fail startup rather than silently
using the baseline. Keep the demo on a trusted machine until access control is
configured; this setup does not add authentication or publish a private URL.

## Verify the complete flow

1. Upload a phone photo, manually select a complete equation, and convert it.
2. Confirm the response identifies the v0.5 model. Correct the text and check preview.
3. In document mode, add a diagram crop and position it with the equation blocks.
4. Download the Overleaf ZIP; verify main.tex references the included figure file.
5. Compile the ZIP in Overleaf and check equation edits, diagram, and ordering.

The phone-v05 profile keeps RGB crop pixels and uses the normal processor resize,
without white square padding, grayscale, or autocontrast. Automatic localization
still selects a region when no manual crop is supplied; this selection has not
been validated by the notebook's pre-cropped validation evaluation. Prefer manual
crop for the first integration check. Diagram crops bypass equation recognition.

Generation explicitly matches the notebook: start token 2, four beams, 256 new
tokens, no sampling, unit length/repetition penalties, and cache enabled.
Transformers is pinned to the notebook's 4.50.0 version. The model has 59.95%
validation CER and 1/34 exact matches after reload. This is not a test-set score.
The API may reject malformed model output rather than return editable LaTeX;
quality and rejection rate must be measured using the actual weights.

## Remaining work

- Run the above checks with the real private checkpoint on the target host.
- Measure latency and failures before choosing CPU or GPU hosting.
- Configure authentication, HTTPS, and private access before remote deployment.
- Keep illustration images for now; optional reviewed TikZ conversion remains a
  future feature in docs/document-pipeline.md.
