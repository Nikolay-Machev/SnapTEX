# SnapTEX beta operations

For the experimental phone v0.5 checkpoint, follow [the private demo setup](phone-v05-demo.md).

## Deployment

Copy `.env.example` to `.env` if needed. Generate a random secret with
`openssl rand -hex 32` and put it in `SNAPTEX_INTERNAL_TOKEN` in `.env`.
Compose supplies the same secret to both services; keep it private. Existing
deployments must add this value before rebuilding both containers.

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

## Local development without Docker

Prepare `.env` with `RECOGNITION_PROVIDER=local` and a random shared
`SNAPTEX_INTERNAL_TOKEN`. Use host paths for SNAPTEX_MODEL_ID, not Docker's
`/models/...` paths. In each terminal, from the repository root, load it with:

```bash
set -a
. ./.env
set +a
```

In the first terminal create/activate `ml/.venv`, install `ml/requirements.txt`
and run `npm run model:serve`. In the second run `npm run dev`. Docker Compose
loads `.env` itself; these separate shell processes require explicit export.
Keep Python private; it is no longer an unauthenticated public recognition API.

## Capacity and abuse controls

- Node admission: 30 conversions per client per minute, including OpenAI.
- OpenAI: 10 calls/minute and 100/day per process by default, plus
  `SNAPTEX_OPENAI_REQUESTS_PER_CLIENT_DAY=10` calls/day per client; no SDK retries,
  a 60-second timeout and a 2,048-token output ceiling. These are request caps,
  not a dollar budget; also configure provider project spending controls.
- Inference concurrency: 2 by default; additional work waits for two seconds.
- Queue overflow: HTTP 503 with a retryable message.
- Inference timeout: HTTP 504 after 120 seconds.
- Upload limit: 8 MiB per image, 20 pages per document. Node uses Busboy file/count/field limits and counts streamed
  multipart bytes before parsing (including chunked uploads); each client may
  read two bodies concurrently. A global 512 MiB
  reservation budget bounds in-flight parsing: every reader reserves its route
  maximum before reading, including when Content-Length is absent or dishonest.
  Larger uploads can still receive 503 when that byte budget is occupied. Python
  independently validates image decoding.
- Document inference releases its shared slot after each region. The single Node worker
  sends one page at a time, leaving capacity for equations when concurrency
  is at least two; a running region cannot be preempted.

Client identity groups IPv6 addresses by /64 and normalizes IPv4-mapped IPv6.
Limiter maps retain at most 10,000 clients and evict the least recently admitted
client on overflow; an evicted client can obtain a fresh quota. This is bounded
beta protection, not a replacement for edge abuse controls.

The built-in limiter is process-local and appropriate for a single beta replica.
Before horizontal scaling, replace it with a shared reverse-proxy or Redis-backed
limit. Counters reset on restart. Start through `npm start` or `npm run dev`
so transport identity and body protection are installed. Configure
`SNAPTEX_TRUSTED_PROXIES` with only your reverse proxy IPs/CIDRs; Node resolves
the nearest untrusted peer from right to left. Empty trusts no proxy.
Python has no rate limiter, `trust_proxy`, or unauthenticated recognition mode.
Node owns public limits. Direct Python recognition requires the shared service
token; missing configuration fails closed. Exposing Python separately requires
an authenticating and limiting proxy. Keep port 8000
private.

## Privacy and retention

Equation images are decoded in memory and discarded after each request. Document
jobs temporarily persist page inputs and results in a private directory
(`SNAPTEX_JOB_DIRECTORY`, Docker volume `document-jobs`). Inputs are removed on
completion, cancellation or failure. Results expire after one hour and are
cleaned within the next minute while the server runs. Backups of this volume
need their own retention policy. Recognition
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

## Conversion history

Successful equation and document conversions are saved in IndexedDB in the user's
browser, including uploaded source files, crop settings, original generated
LaTeX, and document figure assets. History is scoped to the browser/device and
website origin; it does not synchronize between accounts or domains. Clearing
site data, browser eviction, or private browsing can remove it. The UI reports
storage failures and keeps an in-session copy when persistence fails.

Use Conversion history to search filenames or LaTeX and reopen results. Save
edits explicitly preserves corrected source and structured document changes;
Restore generated LaTeX returns to the original output. Entries may be deleted
individually or cleared with confirmation. Prior conversions made before this
feature was installed cannot be recovered automatically. Browser history is separate from the temporary server document jobs; there is
no automatic training-data collection.

## Rendered document and PDF export

Equation and document results have a white A4 document preview. Save PDF prepares
an isolated print frame containing typeset math, prose blocks, and cropped
illustrations. Choose Save as PDF in the browser print dialog and disable its
headers/footers. The export waits for fonts and images, scales long equations to
the page width, preserves source-page breaks, and excludes application controls.
It uses browser/KaTeX typesetting, not a full TeX engine; arbitrary LaTeX packages
and custom macros require the Overleaf project ZIP instead. Invalid math prevents
PDF export and displays a correction message.

The LaTeX source editor is under LaTeX source and corrections. Single-equation
.tex downloads now include the document preamble and can be compiled directly.
When a document's full source has been edited independently of its blocks, PDF
export is disabled to avoid exporting stale content. Compile that edited source
using the project ZIP, or restore the structured document before exporting PDF.

## Asynchronous document API

`POST /api/convert-document` accepts multipart `images` and returns HTTP 202
with `job.id` and a bearer `job.token`. Poll `GET /api/document-jobs/:id` with
`X-Snaptex-Job-Token`; a successful job includes its document in `job.result`.
Use DELETE with the same header to cancel. Missing or invalid tokens return 404.
The browser stores the ticket in session storage and resumes polling on reload;
source-file retry controls require the original files still in the page.

The queue runs one document at a time, with eight active jobs globally, two per
client, 512 MiB active inputs and a 20-minute deadline including queue time.
It retains at most 1,000 records. Queued jobs survive restart; interrupted running
jobs fail explicitly so users can retry. Run exactly one web process/replica per
job directory. A distributed queue and shared limiter are required for scaling.

Unreadable regions are reported with page/region numbers and crop coordinates;
the UI offers retry in equation mode. OpenAI document mode returns an explicit
unsupported-provider error. Fake page output is available only with explicit
`RECOGNITION_PROVIDER=mock`.

## Code formatting and server build

The transport and security layer are TypeScript, checked with the app and compiled
by `npm run build` into `build/transport`. Production runs the compiled server;
development uses `tsx`. No handwritten declaration mirrors are maintained.
`npm run format` and `npm run format:check` cover the TypeScript server,
application and web tests. CI checks that scope.
