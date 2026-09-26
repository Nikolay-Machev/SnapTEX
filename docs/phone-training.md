# Phone-photo formula adaptation pilot

The 100 annotated pages contribute **formula crops**, not full-page documents.
This pilot holds out entire pages: 70 train, 10 validation, and 20 test, with
seed `20260926`. Text and diagram blocks are excluded. The first-pass-reviewed
transcriptions have not been independently verified, and some region boxes
overlap surrounding writing. Review crop previews and the labels before treating
this experiment as a quality claim.

The private training bundle is kept outside Git. It contains 396 train, 56
validation, and 155 test math crops plus provenance. One 586-character block
and eight nearly blank training crops were excluded. The long block exceeds
the current decoder's 256-token generation cap. All
100 original uploads have different byte hashes from the earlier collection
index; their filenames and oriented pixel dimensions match, and the provenance
file records both hashes. Exact original bytes should be preferred if available.

## Prepare again from the source pages

Put the original uploads in `ml/data/phone-photo-100/images` with either their
original upload names or the indexed `phone-001.jpeg` style names. Obtain
`collection-index.jsonl` and `page-annotations-draft.jsonl` from the existing
annotation collection. From the repository root:

```bash
python ml/prepare_phone_training.py \
  --index /path/to/collection-index.jsonl \
  --annotations /path/to/page-annotations-draft.jsonl \
  --images-dir ml/data/phone-photo-100/images \
  --output ml/data/phone-training-v0.2 \
  --allow-reencoded-originals
python ml/validate_dataset.py \
  --train ml/data/phone-training-v0.2/train.jsonl \
  --validation ml/data/phone-training-v0.2/validation.jsonl \
  --photo-test ml/data/phone-training-v0.2/test.jsonl
```

Omit `--allow-reencoded-originals` when the images match the index hashes.
If using reencoded originals, check `provenance.json` and visually inspect
several rotated crops, especially pages with diagrams or dense lines.

## Run on a GPU

Use a Colab T4 or another CUDA GPU. Upload and extract the private
`phone-training-v0.2.zip` into `/content/SnapTEX/ml/data/`. In the Colab
terminal, after cloning or updating this repository:

```bash
cd /content/SnapTEX/ml
python -m pip install -r requirements-train.txt
python validate_dataset.py \
  --train data/phone-training-v0.2/train.jsonl \
  --validation data/phone-training-v0.2/validation.jsonl \
  --photo-test data/phone-training-v0.2/test.jsonl
python train.py \
  --train data/phone-training-v0.2/train.jsonl \
  --validation data/phone-training-v0.2/validation.jsonl \
  --model tjoab/latex_finetuned \
  --output /content/phone-pilot-v0.2 \
  --epochs 2 --batch-size 1 --gradient-accumulation 8 \
  --learning-rate 1e-5 --freeze-encoder --no-augment
```

The training process selects the best validation epoch. Keep the 20 test pages
sealed until training choices are final; then evaluate both the untouched public
baseline and the pilot on the same test crops. Compare with the ten original
repository fixtures as a second, independent regression check. Do not promote
the pilot merely because its training loss falls.

The dataset bundle and model weights contain user-contributed handwriting;
keep them private unless every contributor has approved publication.
