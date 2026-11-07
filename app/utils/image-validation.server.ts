import {
  supportedImageTypes,
  type EquationCrop,
  type EquationImage,
  type SupportedImageType,
} from "~/recognition/types";
import { ConversionError } from "./errors.server";

export const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

export function validateEquationCrop(
  value: FormDataEntryValue | null,
): EquationCrop | undefined {
  if (value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ConversionError("INVALID_CROP", "The crop region is invalid.", 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ConversionError("INVALID_CROP", "The crop region is invalid.", 400);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ConversionError("INVALID_CROP", "The crop region is invalid.", 400);
  }
  const crop = parsed as Record<string, unknown>;
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (
    values.some((number) => typeof number !== "number" || !Number.isFinite(number)) ||
    (crop.x as number) < 0 ||
    (crop.y as number) < 0 ||
    (crop.width as number) <= 0 ||
    (crop.height as number) <= 0 ||
    (crop.x as number) + (crop.width as number) > 1 ||
    (crop.y as number) + (crop.height as number) > 1
  ) {
    throw new ConversionError("INVALID_CROP", "The crop region is invalid.", 400);
  }

  return crop as EquationCrop;
}

export async function validateEquationImage(
  value: FormDataEntryValue | null,
  cropValue: FormDataEntryValue | null = null,
): Promise<EquationImage> {
  if (!(value instanceof File)) {
    throw new ConversionError(
      "IMAGE_REQUIRED",
      "Choose an equation image to convert.",
      400,
    );
  }

  if (value.size === 0) {
    throw new ConversionError("EMPTY_IMAGE", "The selected image is empty.", 400);
  }

  if (!supportedImageTypes.includes(value.type as SupportedImageType)) {
    throw new ConversionError(
      "UNSUPPORTED_IMAGE_TYPE",
      "Use a PNG, JPEG, or WebP image.",
      415,
    );
  }

  if (value.size > MAX_IMAGE_SIZE) {
    throw new ConversionError(
      "IMAGE_TOO_LARGE",
      "The image must be smaller than 8 MB.",
      413,
    );
  }

  const crop = validateEquationCrop(cropValue);
  const bytes = new Uint8Array(await value.arrayBuffer());
  const signature = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v) ? "image/png"
    : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP" ? "image/webp" : undefined;
  if (signature !== value.type) throw new ConversionError("UNSUPPORTED_IMAGE_TYPE", "Image contents do not match a supported PNG, JPEG, or WebP file.", 415);
  return {
    bytes,
    mimeType: value.type as SupportedImageType,
    crop,
  };
}
