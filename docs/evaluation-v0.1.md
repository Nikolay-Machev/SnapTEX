# SnapTEX v0.1 evaluation

## Scope

Ten user-supplied phone photographs are an external regression set and remain
outside training. Results below use `tjoab/latex_finetuned`; the first
fine-tuned checkpoint was rejected after catastrophic decoder collapse.

## Preprocessing comparison

| Input | Average normalized CER | Exact/semantically correct observations |
| --- | ---: | --- |
| Full phone photograph | 487.60% | 0/10 usable |
| Fixed rectangular crop | 610.83% | 0/10 usable |
| Blue-ink detection and tight crop | 72.82% | Euler and Newton exact; mass-energy equivalent; Gauss near-equivalent |

The controlled comparison shows that equation localization is essential: the
recognizer cannot recover a small equation after an entire portrait photograph
is resized to model resolution. Fixed cropping also amplified paper texture and
reverse-side printing. Tight ink-aware cropping reduced CER by about 85% versus
the uncropped run, but complex notation remains below beta quality.

## Current limitations

- The validated detector targets blue ink; black ink and pencil use the legacy
  full-frame fallback.
- Dense equations still confuse accents, operators, Greek symbols, and nested
  subscript/superscript structure.
- CER penalizes equivalent LaTeX spellings and should be reported alongside
  rendered or semantic review.
- Ten examples are a regression seed, not a statistically representative test
  set.

The beta should retain the pretrained baseline behind SnapTEX preprocessing.
Future model training should target phone-photo domain failures and must beat
the baseline on untouched data before a checkpoint is promoted.
