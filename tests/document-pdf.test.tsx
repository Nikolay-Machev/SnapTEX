// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { documentForPrint, fitDocumentMath } from "../app/utils/document-pdf";
import type { DocumentBlock } from "../app/recognition/types";

const equation: DocumentBlock = { id: "equation", type: "display-math", content: String.raw`\frac{x^2}{2}`, page: 1, order: 2, confidence: null };

describe("typeset PDF document", () => {
  it("typesets equations and orders text and illustrations into source pages", () => {
    const blocks: DocumentBlock[] = [
      { id: "second", type: "text", content: "Second page", page: 2, order: 1, confidence: null },
      equation,
      { id: "first", type: "text", content: "First paragraph", page: 1, order: 1, confidence: null },
      { id: "figure", type: "figure", content: "A graph", page: 1, order: 3, confidence: null,
        asset: { path: "figures/figure-1.png", dataUrl: "data:image/png;base64,aGVsbG8=" } },
    ];
    const html = documentForPrint(blocks);
    const root = document.createElement("div");
    root.innerHTML = html;
    expect(root.querySelectorAll(".document-sheet")).toHaveLength(2);
    expect(root.querySelector(".katex")).not.toBeNull();
    expect(root.querySelector("figcaption")?.textContent).toBe("A graph");
    expect(html.indexOf("First paragraph")).toBeLessThan(html.indexOf("A graph"));
    expect(html.indexOf("A graph")).toBeLessThan(html.indexOf("Second page"));
    expect(html).not.toContain("Remove block");
  });

  it("escapes prose and captions and rejects remote illustration URLs", () => {
    const html = documentForPrint([{ id: "text", type: "text", content: '<script>alert("bad")</script>', page: 1, order: 1, confidence: null }]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(() => documentForPrint([{ id: "figure", type: "figure", content: "", page: 1, order: 1, confidence: null,
      asset: { path: "figures/figure-1.png", dataUrl: "https://example.com/photo.png" } }])).toThrow("illustration");
  });

  it("rejects invalid math rather than exporting a broken equation", () => {
    expect(() => documentForPrint([{ ...equation, content: String.raw`\frac{` }])).toThrow("cannot be typeset");
    expect(() => documentForPrint([])).toThrow("before saving");
  });

  it("shrinks long equations to the printable width without clipping their height", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="document-math"><div class="document-math-content"></div></div>';
    const outer = root.firstElementChild as HTMLElement;
    const inner = outer.firstElementChild as HTMLElement;
    Object.defineProperty(outer, "clientWidth", { value: 600 });
    Object.defineProperty(inner, "scrollWidth", { value: 1200 });
    Object.defineProperty(inner, "offsetHeight", { value: 100 });
    fitDocumentMath(root);
    expect(inner.style.transform).toBe("scale(0.5)");
    expect(outer.style.height).toBe("50px");
  });
});
