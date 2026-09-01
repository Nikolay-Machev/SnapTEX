import { describe, expect, it } from "vitest";

import { ConversionError } from "../app/utils/errors.server";
import { validateEquationImage } from "../app/utils/image-validation.server";

describe("validateEquationImage", () => {
  it("accepts a supported image", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "equation.png", {
      type: "image/png",
    });

    const image = await validateEquationImage(file);

    expect(image.mimeType).toBe("image/png");
    expect(image.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects a missing image", async () => {
    await expect(validateEquationImage(null)).rejects.toMatchObject({
      code: "IMAGE_REQUIRED",
      status: 400,
    } satisfies Partial<ConversionError>);
  });

  it("rejects unsupported file types", async () => {
    const file = new File(["not an image"], "equation.txt", {
      type: "text/plain",
    });

    await expect(validateEquationImage(file)).rejects.toMatchObject({
      code: "UNSUPPORTED_IMAGE_TYPE",
      status: 415,
    } satisfies Partial<ConversionError>);
  });
});

