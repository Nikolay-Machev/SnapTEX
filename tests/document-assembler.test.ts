import { describe, expect, it } from "vitest";

import { assembleLatexDocument } from "../app/services/document-assembler";

describe("assembleLatexDocument", () => {
  it("orders blocks by page and position and creates a complete document", () => {
    const latex = assembleLatexDocument(
      [
        { id: "b", type: "display-math", content: "y=2", page: 2, order: 1, confidence: null },
        { id: "a", type: "text", content: "Cost is 50%", page: 1, order: 1, confidence: null },
        { id: "c", type: "display-math", content: "x=1", page: 1, order: 2, confidence: null },
      ],
      2,
    );

    expect(latex).toContain(String.raw`\documentclass{article}`);
    expect(latex).toContain(String.raw`Cost is 50\%`);
    expect(latex.indexOf("x=1")).toBeLessThan(latex.indexOf("y=2"));
    expect(latex).toContain(String.raw`\newpage`);
    expect(latex.trimEnd()).toMatch(/\\end\{document\}$/);
  });
});
