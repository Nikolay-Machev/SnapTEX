import katex from "katex";

type LatexPreviewProps = {
  latex: string;
};

export function LatexPreview({ latex }: LatexPreviewProps) {
  const html = katex.renderToString(latex || String.raw`\text{Your equation}`, {
    displayMode: true,
    throwOnError: false,
    strict: false,
  });

  return (
    <div
      className="min-h-36 overflow-x-auto rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm"
      aria-label="Rendered equation preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

