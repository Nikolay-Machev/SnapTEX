import katex from "katex";
import type { DocumentBlock } from "~/recognition/types";

export function PaperDocument({ blocks }: { blocks: DocumentBlock[] }) {
  const ordered = [...blocks].sort((a, b) => a.page - b.page || a.order - b.order);
  const pages = [...new Set(ordered.map((block) => block.page))];
  return <div className="paper-document" aria-label="Typeset document">
    {pages.map((page) => <article key={page} className="document-sheet" aria-label={`Document page ${page}`}>
      {ordered.filter((block) => block.page === page).map((block) => {
        if (block.type === "figure") return <figure key={block.id} className="document-figure">
          <img src={block.asset.dataUrl} alt={block.content || "Illustration"} />
          {block.content && <figcaption>{block.content}</figcaption>}
        </figure>;
        if (block.type === "text") return <p key={block.id} className="document-paragraph">{block.content}</p>;
        const html = katex.renderToString(block.content, { displayMode: true, throwOnError: false, strict: false, trust: false });
        return <div key={block.id} className="document-math"><div className="document-math-content" dangerouslySetInnerHTML={{ __html: html }} /></div>;
      })}
    </article>)}
  </div>;
}
