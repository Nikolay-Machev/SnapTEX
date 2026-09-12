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

  return {
    bytes: new Uint8Array(await value.arrayBuffer()),
    mimeType: value.type as SupportedImageType,
    crop: validateEquationCrop(cropValue),
  };
}
