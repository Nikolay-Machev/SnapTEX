import { describe, expect, it } from "vitest";

import { MockRecognizer } from "../app/recognition/mock-recognizer.server";

describe("MockRecognizer", () => {
  it("returns the normalized conversion contract", async () => {
    const recognizer = new MockRecognizer();
    const result = await recognizer.recognize({
      bytes: new Uint8Array([137, 80, 78, 71]),
      mimeType: "image/png",
    });

    expect(result.provider).toBe("mock");
    expect(result.latex).toContain("\\frac");
    expect(result.confidence).toBeNull();
    expect(result.warnings).toEqual([]);
  });
});

