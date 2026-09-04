# Fine-tuning data

The v0.1 prototype uses a deterministic 1,000-example subset of Google Research MathWriting: 900 human-written training records and 100 human-written records from its official validation split.

Prepare it with:

```bash
cd ml
python prepare_mathwriting.py --download
```

The full upstream archive is large (approximately 2.9 GB). You can download it yourself and pass `--archive PATH` or extract it and pass `--source-root PATH`. The generated directory contains `train.jsonl`, `validation.jsonl`, provenance metadata, and rasterized PNGs.

Each manifest line contains a path relative to its manifest and the exact normalized target LaTeX:

```json
{"image":"images/example.jpeg","latex":"\\frac{a}{b}"}
```

Every accepted record is verified structurally against its InkML annotations and must state `inkCreationMethod=human`. This verifies provenance and label consistency; it does not imply that a person re-audited all 1,000 equations individually.

Do not train on the ten external evaluation fixtures. Keeping evaluation images separate prevents leakage and makes the reported character error rate meaningful. Add failed real-world inputs only with the uploader's permission and after removing metadata.
