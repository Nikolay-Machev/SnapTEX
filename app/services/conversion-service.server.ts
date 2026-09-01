import { equationRecognizer } from "~/recognition/recognizer.server";
import type { ConversionResult } from "~/recognition/types";
import { ConversionError } from "~/utils/errors.server";
import { validateEquationImage } from "~/utils/image-validation.server";

export async function convertEquation(
  imageValue: FormDataEntryValue | null,
): Promise<ConversionResult> {
  const image = await validateEquationImage(imageValue);

  try {
    const result = await equationRecognizer.recognize(image);

    if (!result.latex.trim()) {
      throw new ConversionError(
        "INVALID_MODEL_OUTPUT",
        "The recognizer returned an empty result.",
        502,
      );
    }

    return result;
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }

    throw new ConversionError(
      "RECOGNITION_FAILED",
      "The equation could not be recognized.",
      502,
    );
  }
}

