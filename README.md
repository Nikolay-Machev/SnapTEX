# SnapTEX

A full-stack web application that converts images of mathematical equations into clean LaTeX code. Users can upload an equation, generate editable LaTeX, preview the rendered result in real time, and copy it directly into Overleaf or any other LaTeX editor.

## Architecture

SnapTEX is initially structured as a Remix modular monolith. Image recognition is accessed through a provider-independent interface, allowing OpenAI or Claude to be replaced later by the native SnapTEX model.

See [Architecture](docs/architecture.md) for the complete design.
