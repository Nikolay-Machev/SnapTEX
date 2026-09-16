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

The 100 phone photographs are an untouched page-level evaluation set, not
training data. They require region boxes, reading-order links, block classes,
and verified transcriptions before final evaluation. Training should use a
separate annotated page corpus to avoid leakage.
