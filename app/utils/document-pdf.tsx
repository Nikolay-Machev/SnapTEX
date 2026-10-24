import { renderToStaticMarkup } from "react-dom/server";
import katex from "katex";
import { PaperDocument } from "~/components/paper-document";
import type { DocumentBlock } from "~/recognition/types";

// Shared by the on-screen document and isolated print frame.
export const documentStyles = `
.paper-document { color: #111; font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.6; }
.document-sheet { box-sizing: border-box; width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto 18px; background: white; box-shadow: 0 2px 12px #0002; }
.document-paragraph { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 1em; }
.document-math { display: flex; justify-content: center; margin: 1em 0; break-inside: avoid; }
.document-math-content { flex-shrink: 0; width: max-content; transform-origin: center top; }
.document-figure { margin: 1.5em 0; text-align: center; break-inside: avoid; }
.document-figure img { display: block; margin: auto; max-width: 100%; max-height: 220mm; object-fit: contain; }
.document-figure figcaption { font-size: 10pt; margin-top: .5em; }
@page { size: A4; margin: 20mm; }
@media print {
  html, body { min-width: 0; min-height: 0; margin: 0; background: white; }
  .document-sheet { width: auto; min-height: 0; padding: 0; margin: 0; box-shadow: none; break-after: page; }
  .document-sheet:last-child { break-after: auto; }
}
`;

export function documentForPrint(blocks: DocumentBlock[]): string {
  if (!blocks.length) throw new Error("Convert an equation or document before saving a PDF.");
  for (const block of blocks) {
    if (block.type === "display-math") {
      try { katex.renderToString(block.content, { throwOnError: true, strict: false, trust: false }); }
      catch { throw new Error("An equation cannot be typeset. Correct its LaTeX before saving a PDF, or download the source to compile in Overleaf."); }
    }
    if (block.type === "figure" && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(block.asset.dataUrl)) {
      throw new Error("An illustration is missing or has an unsupported format.");
    }
  }
  return renderToStaticMarkup(<PaperDocument blocks={blocks} />);
}

export function fitDocumentMath(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".document-math").forEach((outer) => {
    const inner = outer.querySelector<HTMLElement>(".document-math-content");
    if (!inner) return;
    const scale = Math.min(1, outer.clientWidth / Math.max(inner.scrollWidth, 1));
    inner.style.transform = `scale(${scale})`;
    outer.style.height = `${inner.offsetHeight * scale}px`;
  });
}

export async function saveDocumentPdf(blocks: DocumentBlock[]): Promise<void> {
  const markup = documentForPrint(blocks);
  const frame = document.createElement("iframe");
  frame.title = "SnapTEX PDF export";
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "210mm", height: "297mm", border: "0" });
  // Reuse bundled stylesheets so KaTeX's font URLs resolve exactly as in the app.
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => {
    const clone = node.cloneNode(true) as HTMLElement;
    if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
    return clone.outerHTML;
  }).join("");
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("PDF preview took too long to load. Please try again.")), 20000);
      frame.onload = () => { window.clearTimeout(timeout); resolve(); };
      frame.onerror = () => { window.clearTimeout(timeout); reject(new Error("Could not load the PDF preview.")); };
    });
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>SnapTEX document</title>${styles}<style>${documentStyles}</style></head><body>${markup}</body></html>`;
    document.body.append(frame);
    await loaded;
    const target = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!target || !doc) throw new Error("PDF export is unavailable in this browser.");
    await doc.fonts?.ready;
    await Promise.all([...doc.images].map((image) => image.decode()));
    fitDocumentMath(doc);
    target.addEventListener("afterprint", () => frame.remove(), { once: true });
    // Some browsers return from print before the dialog closes.
    window.setTimeout(() => frame.remove(), 5 * 60 * 1000);
    target.focus();
    target.print();
  } catch (error) {
    frame.remove();
    throw error;
  }
}
