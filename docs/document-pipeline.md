# Multi-page document pipeline

SnapTEX supports two independent workflows:

1. **Equation mode** converts one equation image through `/api/convert`.
2. **Document mode** accepts up to 20 ordered page photographs through
   `/api/convert-document`, detects multiple candidate regions per page,
   recognizes them in reading order, and assembles a complete `.tex` document.

Document output includes an editable source editor, a structured block preview,
copy-to-clipboard, and `.tex` download. The assembler emits a conservative
article preamble with `amsmath`, `amssymb`, page comments, display-math blocks,
and explicit page breaks.

## Contracts

The web layer represents recognition as ordered `DocumentBlock` values. A block
has a stable ID, page number, order, type (`text` or `display-math`), content,
and optional confidence. This keeps page layout, recognition, and LaTeX
composition separate, so the recognizers can improve without rewriting the UI.

The local Python service exposes `/recognize-page`. It performs color-independent
line-band localization and invokes the existing formula recognizer once per
candidate region. Failed regions are skipped rather than poisoning the complete
document.

## Current limitation

The current local checkpoint is an image-to-formula model. It does not recognize
handwritten prose, headings, diagrams, tables, or semantic relationships between
regions. `/recognize-page` therefore returns equation blocks and the explicit
`TEXT_OCR_UNAVAILABLE` warning. The mock provider demonstrates mixed text and
math blocks for frontend and contract testing.

Full-page fidelity requires three later model components:

- a page-layout detector trained to classify text, display math, inline math,
  diagrams, and tables;
- a handwriting OCR model for prose;
- a document-order/composition model that joins regions across pages.

The 100 phone photographs now have first-pass page annotations. A separate
formula pilot uses math crops from 70 pages for training and 10 for validation;
the remaining 20 pages are held out. This does not train the page-layout,
prose-OCR, or document-composition components. See `docs/phone-training.md`.

## Cropped graphs and illustrations

After converting pages in Document mode, use **Add a graph or illustration**:
choose the source page, drag around the drawing (including its labels), choose
its position after a recognized block, and optionally add a caption. The crop
uses the original image pixels and stays in the browser. Review the preview and
remove incorrect recognition blocks that came from the drawing.

**Download project ZIP** exports `main.tex` and `figures/figure-*.png`, ready to
upload together to Overleaf. The assembler adds `graphicx` when figures exist
and includes them inline in the selected reading order. **Download .tex** and
copy still export source only; images require the project ZIP. Edited source is
preserved in the ZIP. Adding/removing structured blocks after editing source
requires explicitly replacing source edits with the structured document.

Figure selection is manual: automatic diagram detection and exclusion from
formula recognition are not implemented. Images and region metadata are not
persisted after the browser session or a new conversion. Figure blocks are
separate from formula crops and must not become equation-only training pairs.

## TODO: editable diagrams

- [ ] Add optional, reviewable TikZ/PGFPlots reconstruction for graphs and
      illustrations. Keep the original crop as a fallback, preserve all labels,
      let users choose image versus editable code, and compile-check generated
      code before export. Do not infer a plotted function from its shape alone.
- [ ] Detect diagram regions before formula recognition and preserve their
      original crops automatically, with manual correction of boundaries.
