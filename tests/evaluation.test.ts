import { describe, expect, it } from "vitest";

import {
  characterErrorRate,
  levenshteinDistance,
  normalizeLatex,
} from "../scripts/evaluation";

describe("evaluation metrics", () => {
  it("normalizes inconsequential LaTeX formatting", () => {
    expect(normalizeLatex(String.raw`$ \left( x + 1 \right) $`)).toBe(
      String.raw`(x+1)`,
    );
  });

  it("calculates edit distance and character error rate", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(characterErrorRate("x^2", "x_2")).toBeCloseTo(1 / 3);
    expect(characterErrorRate("E = mc^2", "E=mc^2")).toBe(0);
  });
});
