# SnapTEX TrOCR v0.1

## Status

Training pipeline implemented; weights not yet trained or released. Do not describe this repository state as a completed model checkpoint.

## Intended use

Transcribe a single handwritten mathematical expression image into normalized LaTeX. The model is not intended to solve equations or interpret full documents.

## Base model

`tjoab/latex_finetuned`, a TrOCR `VisionEncoderDecoderModel` checkpoint specialized for handwritten mathematical expressions.

## Prototype data

- 900 deterministic human-written samples from MathWriting's official `train` split.
- 100 deterministic human-written samples from MathWriting's official `valid` split.
- 10 separately collected phone photographs, used only as an external test set.
- Seed: `20260904`.

MathWriting records are accepted only when `normalizedLabel`, `sampleId`, `splitTagOriginal`, and `inkCreationMethod=human` are present and internally consistent. Ink strokes are rasterized locally. Synthetic MathWriting records are excluded.

## License limitation

The MathWriting archive states CC BY-NC-SA 4.0 for dataset content, while LaTeX expressions derived from Wikipedia are covered by CC BY-SA 4.0. This makes v0.1 a research/noncommercial prototype. A commercial SnapTEX checkpoint needs appropriately licensed or directly consented training data and a separate legal review.

## Training

Three epochs, batch size four, learning rate `5e-5`, phone-photo augmentation, fixed seed, and best-checkpoint selection using the validation split. The ten external photographs must never enter training or hyperparameter selection.

## Evaluation

Report normalized character error rate and normalized exact match separately for:

1. the untouched MathWriting validation subset;
2. the ten external phone photographs.

## Known limitations

- The prototype set is too small for broad handwriting coverage.
- MathWriting uses pen trajectories rasterized onto clean backgrounds, not native photographs.
- Phone-photo augmentation approximates but does not reproduce all real lighting, perspective, blur, and paper artifacts.
- Long or multiline expressions may be truncated at 256 target tokens.
