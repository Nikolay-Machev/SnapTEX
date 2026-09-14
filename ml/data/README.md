# Fine-tuning data

The v0.2 domain-adaptation experiment uses 2,400 complexity-enriched,
human-written MathWriting training records and 300 official validation records.
The original ten SnapTEX fixtures and the new 100-photo collection are test data
only and must never enter model selection or training.

Prepare v0.2 with:

```bash
cd ml
python prepare_mathwriting.py --download
```

The defaults now write `data/mathwriting-2700`. Selection is deterministic and
reserves half the sample for expressions ranked by structural features such as
fractions, large operators, Greek symbols, matrices, accents, partial
derivatives, repeated scripts, and length.

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

For the new phone-photo test collection, keep the image directory outside Git
and initialize a labeling manifest:

```bash
python init_photo_manifest.py \
  --images data/phone-photo-100/images \
  --output data/phone-photo-100/test.jsonl
```

Replace every `REPLACE_WITH_VERIFIED_LATEX` value after independently checking
the photograph. Then validate files, labels, hashes, and split separation:

```bash
python validate_dataset.py \
  --train data/mathwriting-2700/train.jsonl \
  --validation data/mathwriting-2700/validation.jsonl \
  --photo-test data/phone-photo-100/test.jsonl
```

The validator rejects missing labels, duplicate sample IDs, duplicate image
content, changed files, unreadable images, cross-split leakage, and copies of the
ten protected repository fixtures.
