import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createDocumentArchive, figureCropBounds } from "../app/utils/document-export";
import { assembleLatexDocument } from "../app/services/document-assembler";
import type { DocumentBlock } from "../app/recognition/types";

const figure: DocumentBlock = {
  id: "figure-test", type: "figure", content: "Field & potential_1", page: 1,
  order: 2, confidence: null,
  asset: { path: "figures/figure-test.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
};

describe("illustration export", () => {
  it("bundles edited source and exact image bytes at the referenced path", () => {
    const equation: DocumentBlock = { id: "math", type: "display-math", content: "E=0", page: 1, order: 1, confidence: null };
    const latex = assembleLatexDocument([figure, equation], 1);
    expect(latex).toContain(String.raw`\usepackage{graphicx}`);
    expect(latex).toContain("{figures/figure-test.png}");
    expect(latex).toContain(String.raw`Field \& potential\_1`);
    expect(latex.indexOf("E=0")).toBeLessThan(latex.indexOf("includegraphics"));
    const files = unzipSync(createDocumentArchive(latex + "% edited", [figure]));
    expect(Object.keys(files)).toEqual(["main.tex", "figures/figure-test.png"]);
    expect(strFromU8(files["main.tex"])).toBe(latex + "% edited");
    expect([...files[figure.asset.path]]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("omits removed assets and rejects unsafe filenames", () => {
    expect(Object.keys(unzipSync(createDocumentArchive("test", [])))).toEqual(["main.tex"]);
    const invalid = { ...figure, asset: { ...figure.asset, path: "../escape.png" } };
    expect(() => createDocumentArchive("test", [invalid])).toThrow();
    expect(() => assembleLatexDocument([invalid], 1)).toThrow();
  });

  it("maps normalized selections to original pixels and rejects invalid crops", () => {
    expect(figureCropBounds(1200, 1600, { x: 0.25, y: 0.5, width: 0.5, height: 0.25 }))
      .toEqual({ x: 300, y: 800, width: 600, height: 400 });
    expect(() => figureCropBounds(1200, 1600, { x: 0.9, y: 0, width: 0.2, height: 0.2 })).toThrow();
    expect(() => figureCropBounds(1200, 1600, { x: NaN, y: 0, width: 0.2, height: 0.2 })).toThrow();
  });
});
