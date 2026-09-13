import { describe, expect, it } from "vitest";

import { cropFromPoints } from "../app/components/image-crop-selector";

describe("cropFromPoints", () => {
  it("normalizes a bottom-right drag", () => {
    expect(cropFromPoints({ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 })).toEqual({
      x: 0.2,
      y: 0.3,
      width: 0.6000000000000001,
      height: 0.39999999999999997,
    });
  });

  it("normalizes a reverse drag", () => {
    expect(cropFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.3 })).toEqual({
      x: 0.2,
      y: 0.3,
      width: 0.6000000000000001,
      height: 0.39999999999999997,
    });
  });
});
