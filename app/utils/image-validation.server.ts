import {
  supportedImageTypes,
  type EquationImage,
  type SupportedImageType,
} from "~/recognition/types";
import { ConversionError } from "./errors.server";

export const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

export async function validateEquationImage(
  value: FormDataEntryValue | null,
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
  };
}

