# SnapTEX

A full-stack web application that converts images of mathematical equations into clean LaTeX code. Users can upload an equation, generate editable LaTeX, preview the rendered result in real time, and copy it directly into Overleaf or any other LaTeX editor.

## Development

SnapTEX uses React Router Framework Mode, the current continuation of Remix, with TypeScript, Tailwind CSS, and KaTeX.

Requirements: Node.js 22.22 or newer.

```bash
npm install
npm run dev
```

The first implementation uses `MockRecognizer`, so no API key is required. Uploading any supported image returns a sample quadratic-formula transcription and exercises the complete upload-to-preview flow.

Run the checks with:

```bash
npm run typecheck
npm test
npm run build
```

## Architecture

SnapTEX is initially structured as a React Router Framework Mode modular monolith. Image recognition is accessed through a provider-independent interface, allowing OpenAI or Claude to be replaced later by the native SnapTEX model.

See [Architecture](docs/architecture.md) for the complete design.
