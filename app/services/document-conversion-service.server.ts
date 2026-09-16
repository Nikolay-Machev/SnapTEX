import { pageRecognizer } from "~/recognition/page-recognizer.server";
import type { DocumentConversionResult } from "~/recognition/types";
import { ConversionError } from "~/utils/errors.server";
import { validateEquationImage } from "~/utils/image-validation.server";
import { assembleLatexDocument } from "./document-assembler";

export const MAX_DOCUMENT_PAGES = 20;

export async function convertDocument(
  imageValues: FormDataEntryValue[],
): Promise<DocumentConversionResult> {
  if (imageValues.length === 0) {
    throw new ConversionError("IMAGE_REQUIRED", "Choose at least one page image.", 400);
  }
  if (imageValues.length > MAX_DOCUMENT_PAGES) {
    throw new ConversionError(
      "IMAGE_TOO_LARGE",
      `A document can contain at most ${MAX_DOCUMENT_PAGES} pages.`,
      413,
    );
  }

  const images = await Promise.all(
    imageValues.map((value) => validateEquationImage(value)),
  );
  try {
    const pages = [];
    for (const [index, image] of images.entries()) {
      pages.push(await pageRecognizer.recognizePage(image, index + 1));
    }
    const blocks = pages.flatMap((page) => page.blocks);
    if (blocks.length === 0) {
      throw new ConversionError(
        "INVALID_MODEL_OUTPUT",
        "No readable regions were found in the uploaded pages.",
        502,
      );
    }
    return {
      latex: assembleLatexDocument(blocks, images.length),
      blocks,
      warnings: pages.flatMap((page) => page.warnings),
      provider: [...new Set(pages.map((page) => page.provider))].join(", "),
      pageCount: images.length,
    };
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError(
      "RECOGNITION_FAILED",
      "The document pages could not be recognized.",
      502,
    );
  }
}
