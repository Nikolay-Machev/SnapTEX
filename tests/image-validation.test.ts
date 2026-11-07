import { describe, expect, it } from "vitest";

import { ConversionError } from "../app/utils/errors.server";
import {
  validateEquationCrop,
  validateEquationImage,
} from "../app/utils/image-validation.server";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHosAAAAASUVORK5CYII=", "base64");

describe("validateEquationImage", () => {
  it("accepts a supported image", async () => {
    const file = new File([png], "equation.png", {
      type: "image/png",
    });

    const image = await validateEquationImage(file);

    expect(image.mimeType).toBe("image/png");
    expect(image.bytes).toEqual(new Uint8Array(png));
  });

  it("attaches a normalized manual crop", async () => {
    const file = new File([png], "equation.png", {
      type: "image/png",
    });
    const crop = JSON.stringify({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
    const image = await validateEquationImage(file, crop);
    expect(image.crop).toEqual({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
  });

  it("rejects a crop that extends beyond the image", () => {
    expect(() =>
      validateEquationCrop(JSON.stringify({ x: 0.8, y: 0, width: 0.3, height: 1 })),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CROP", status: 400 }));
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

it("rejects files whose declared MIME type disagrees with their bytes", async () => {
  await expect(validateEquationImage(new File(["<html>not a PNG</html>"], "fake.png", { type: "image/png" }))).rejects.toMatchObject({ status: 415 });
  await expect(validateEquationImage(new File([png], "fake.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ status: 415 });
});
