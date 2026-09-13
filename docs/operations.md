# SnapTEX beta operations

## Deployment

The beta deploys as two containers. `web` serves the React Router application;
`recognition` owns PyTorch and the baseline model. Start both with:

```bash
docker compose up --build -d
docker compose ps
```

The named `huggingface-cache` volume survives container replacement, so the
1.3 GB baseline is not downloaded on each deployment. Keep
`SNAPTEX_MODEL_ID=tjoab/latex_finetuned`; the failed experimental v0.1 checkpoint
is not approved for beta use.

`/health` identifies the model, `/ready` is the container readiness check, and
`/metrics` exposes process-local request, failure, rate-limit, busy, and total
latency counters. Application logs are single-line JSON and include request ID,
method, path, status, and duration. They never include image bytes or LaTeX.

## Capacity and abuse controls

- Rate limit: 30 recognition requests per client per minute.
- Inference concurrency: 2 by default; additional work waits for two seconds.
- Queue overflow: HTTP 503 with a retryable message.
- Inference timeout: HTTP 504 after 120 seconds.
- Upload limit: 8 MB, enforced independently by both services.

The built-in limiter is process-local and appropriate for a single beta replica.
Before horizontal scaling, replace it with a shared reverse-proxy or Redis-backed
limit. Trust `X-Forwarded-For` only when the proxy overwrites that header.

## Privacy and retention

Equation images are decoded in memory and discarded after each request. SnapTEX
does not persist uploads, generated LaTeX, or crop coordinates. Recognition
responses carry `Cache-Control: no-store`. Infrastructure logs must not record
multipart bodies, response bodies, or query strings.

Do not collect failed photographs or corrected LaTeX automatically. A future
training-data contribution flow must be opt-in, explain the intended use, permit
withdrawal, and store consent and provenance beside each sample. Set an explicit
retention period before enabling that feature.

## Release gate

With the baseline service healthy, run:

```bash
npm run eval:gate
```

The command sends all ten untouched phone photographs through HTTP, saves the
report under `evaluation-results/`, and fails if average CER exceeds 80% or any
request errors. The 80% threshold protects the current 72.82% preprocessing
baseline; it is a regression gate, not a claim of production-grade accuracy.

Before a release, also complete one manual browser pass: automatic crop, manual
crop, conversion, LaTeX edit, KaTeX render, and clipboard copy.
