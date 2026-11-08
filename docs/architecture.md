# Architecture

SnapTEX is a React Router application with a private Python inference service.
This document describes the implemented system; future model improvements are
tracked separately from the current API contract.

## Boundaries

| Component | Owns |
| --- | --- |
| Browser | Upload/crop controls, editable source, preview/export, IndexedDB history |
| Node transport | Trusted proxy identity, per-client admission and paid-provider quotas |
| Node conversion routes | Bounded streaming multipart parsing, signature/type/size/crop validation, public errors |
| Recognition clients | Shared private-service HTTP transport, Zod response decoding, mock and OpenAI adapters |
| Document worker | Single-document queue, deadlines/cancellation, private disk persistence and cleanup |
| Python service | Shared-token authentication, typed crop contract, image decoding/localization, model concurrency and inference |
| Checkpoint | Tokenizer, processor, weights, generation configuration and SnapTEX RGB metadata |

`/api/convert` returns an equation synchronously. `/api/convert-document` returns
202 and a token-protected job ticket; GET/DELETE `/api/document-jobs/:id` poll or
cancel it. Failed regions are explicit warnings with retry crop coordinates.
Document mode supports local/snaptex and explicit mock only. OpenAI is available
for equations, not silently substituted with mock pages.

## Contracts

`app/recognition/types.ts` defines Zod schemas and inferred types for crops,
warnings, blocks, results and conversion responses. The shared
`RecognitionServiceClient` implements equation and page interfaces using one
transport path. `MockRecognizer` implements both interfaces for offline testing.
Browser document state can add figure blocks without sending those drawings
through formula OCR. The Overleaf ZIP includes the original cropped figures;
reviewed TikZ conversion remains a future feature.

## Resource ownership

Node owns user-facing validation, upload memory reservations and rate limits.
Busboy enforces multipart file/count/field limits. The custom Node limiter is
retained for bounded eviction and coordinated paid-budget checks. See operations
for its limits and the trusted proxy configuration.

Python is a private worker and requires the shared service token for recognition.
It has no public rate limiter or standalone unauthenticated mode. Anyone exposing
it outside Node must provide an authenticating, limiting proxy. Pillow decoding
and structural crop parsing remain worker input contracts; pixel-size crop checks
prevent empty model inputs. Python retains inference slots and an inference timeout
because an HTTP abort cannot stop a running Torch thread. Slots are not released
until that thread finishes. This is model resource protection, not a second user
quota. There is no separate document semaphore: the one Node worker sends pages
sequentially and Python yields its shared model slot between regions.

## Storage and deployment

The queue is deliberately durable: queued uploads can resume after restart;
interrupted running jobs fail clearly instead of repeating inference. Browser
history and temporary server jobs have different retention. Use one web process
per job directory; a distributed queue/limiter is needed before horizontal scaling.
Detailed limits, retention, secret setup and rebuild steps are in
[operations](operations.md). Do not store model weights or private input photos in Git.

Generation uses the loaded checkpoint configuration without per-call arguments.
An offline migration saves the existing legacy/phone-v05 settings and RGB choice;
a compatibility loader preserves older mounted checkpoints until migration.
See [the v0.5 demo](phone-v05-demo.md).

## Validation and future work

`npm run typecheck`, `npm test`, `npm run format:check`, `npm run build` and the
Python tests cover contracts and infrastructure. One [evaluation CLI](EVALUATION.md)
measures checkpoints and every Node provider on the same manifest. Generated
reports remain separate from training data.

Recognition remains experimental. Full-page prose OCR, semantic layout, accurate
complex notation and reviewed diagram-to-TikZ conversion require further work.
