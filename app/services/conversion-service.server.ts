import { equationRecognizer } from "~/recognition/recognizer.server";
import {
  conversionResultSchema,
  type ConversionResult,
} from "~/recognition/types";
import { ConversionError } from "~/utils/errors.server";
import { validateEquationImage } from "~/utils/image-validation.server";

export async function convertEquation(
  imageValue: FormDataEntryValue | null,
  cropValue: FormDataEntryValue | null = null,
): Promise<ConversionResult> {
  const image = await validateEquationImage(imageValue, cropValue);

  try {
    const result = conversionResultSchema.safeParse(
      await equationRecognizer.recognize(image),
    );

    if (!result.success) {
      throw new ConversionError(
        "INVALID_MODEL_OUTPUT",
        "The recognizer returned an invalid result.",
        502,
      );
    }

    return result.data;
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
