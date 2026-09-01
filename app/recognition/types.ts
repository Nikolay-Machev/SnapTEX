export const supportedImageTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type SupportedImageType = (typeof supportedImageTypes)[number];

export type EquationImage = {
  bytes: Uint8Array;
  mimeType: SupportedImageType;
};

export type ConversionWarning = {
  code: "AMBIGUOUS_SYMBOL" | "UNREADABLE_REGION" | "MULTIPLE_EQUATIONS";
  message: string;
};

export type ConversionResult = {
  latex: string;
  confidence: number | null;
  warnings: ConversionWarning[];
  provider: string;
};

export interface EquationRecognizer {
  recognize(image: EquationImage): Promise<ConversionResult>;
}

export type ConversionErrorCode =
  | "IMAGE_REQUIRED"
  | "EMPTY_IMAGE"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "IMAGE_TOO_LARGE"
  | "RECOGNITION_FAILED"
  | "INVALID_MODEL_OUTPUT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ConvertResponse =
  | { success: true; result: ConversionResult }
  | {
      success: false;
      error: { code: ConversionErrorCode; message: string };
    };

