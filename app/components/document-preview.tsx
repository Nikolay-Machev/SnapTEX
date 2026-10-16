import type { DocumentBlock } from "~/recognition/types";
import { LatexPreview } from "./latex-preview";

export function DocumentPreview({ blocks, onRemove }: { blocks: DocumentBlock[]; onRemove?: (id: string) => void }) {
  if (blocks.length === 0) {
    return (
      <div className="min-h-36 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Your recognized document structure will appear here.
      </div>
    );
  }
  const pages = [...new Set(blocks.map((block) => block.page))];
  return (
    <div className="max-h-[32rem] space-y-5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-100 p-4">
      {pages.map((page) => (
        <article key={page} className="rounded-lg bg-white p-5 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Page {page}
          </p>
          <div className="space-y-3">
            {blocks
              .filter((block) => block.page === page)
              .sort((left, right) => left.order - right.order)
              .map((block) => (
                <div key={block.id}>
                {block.type === "figure" ? (
                  <figure>
                    <img src={block.asset.dataUrl} alt={block.content || "Cropped illustration"} className="mx-auto max-h-96 max-w-full object-contain" />
                    {block.content && <figcaption className="mt-2 text-center text-sm text-slate-600">{block.content}</figcaption>}
                  </figure>
                ) : block.type === "text" ? (
                  <p key={block.id} className="text-sm leading-6 text-slate-700">
                    {block.content}
                  </p>
                ) : (
                  <LatexPreview key={block.id} latex={block.content} />
                )}
                {onRemove && <button type="button" onClick={() => onRemove(block.id)} className="mt-1 text-xs text-rose-700">Remove block</button>}
                </div>
              ))}
          </div>
        </article>
      ))}
    </div>
  );
}
