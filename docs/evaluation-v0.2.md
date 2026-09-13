# SnapTEX v0.2 evaluation diagnostics

## Metric correction

The original evaluator removed whitespace and `\\left`/`\\right`, but still
penalized braces around one-character superscripts and subscripts. These forms
are equivalent in LaTeX: `mc^2` and `mc^{2}`, for example. Normalizing those
braces changes the recorded ten-image result as follows without changing a
single prediction:

| Metric | Original evaluator | Corrected evaluator |
| --- | ---: | ---: |
| Average CER | 80.44% | 70.79% |
| Normalized exact matches | 2/10 | 3/10 |
| Rejected generations | 3/10 | 3/10 |

The corrected metric remains deliberately conservative. It does not treat
different Greek glyph commands or different operators as equivalent.

## Rejected output diagnosis

`SNAPTEX_DIAGNOSTICS=true` permits a local evaluator to capture a rejected raw
generation and validation reason. It defaults to false and production responses
remain generic. All three failures were unbalanced model generations:

| Fixture | Validation reason |
| --- | --- |
| Schrödinger equation | Unbalanced braces |
| Black–Scholes equation | Unbalanced braces |
| Shannon entropy | Unbalanced braces |

These are model-quality failures rather than HTTP, timeout, or preprocessing
exceptions.

## Automatic versus manual crop

Three manually reviewed normalized crops are stored in
`tests/fixtures/equations/difficult-equations.json`. On the same baseline:

| Crop mode | Average CER | Rejected generations |
| --- | ---: | ---: |
| Automatic | 100.00% | 3/3 |
| Manual | 101.60% | 1/3 |

Manual cropping helped the decoder produce structurally valid strings for the
Schrödinger and Black–Scholes inputs, but those strings remained inaccurate.
This indicates that the manual-crop fallback works while also showing that crop
changes alone cannot make the baseline reliable on complex notation.

Run the comparison against a local diagnostic service with:

```bash
SNAPTEX_DIAGNOSTICS=true npm run model:serve
npm run eval:crops
```

The next model experiment should target complex, multi-level expressions and
must retain this three-image set as untouched evaluation data.
