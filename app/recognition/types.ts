export const supportedImageTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type SupportedImageType = (typeof supportedImageTypes)[number];

export type EquationCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EquationImage = {
  bytes: Uint8Array;
  mimeType: SupportedImageType;
  crop?: EquationCrop;
};

export type ConversionWarning = {
  code:
    | "AMBIGUOUS_SYMBOL"
    | "UNREADABLE_REGION"
    | "MULTIPLE_EQUATIONS"
    | "TEXT_OCR_UNAVAILABLE"
    | "PAGE_ROTATED";
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

export type DocumentBlockType = "text" | "display-math";

export type DocumentBlock = {
  id: string;
  type: DocumentBlockType;
  content: string;
  page: number;
  order: number;
  confidence: number | null;
};

export type PageRecognitionResult = {
  blocks: DocumentBlock[];
  warnings: ConversionWarning[];
  provider: string;
};

export interface PageRecognizer {
  recognizePage(image: EquationImage, page: number): Promise<PageRecognitionResult>;
}

export type DocumentConversionResult = {
  latex: string;
  blocks: DocumentBlock[];
  warnings: ConversionWarning[];
  provider: string;
  pageCount: number;
};

export type ConversionErrorCode =
  | "IMAGE_REQUIRED"
  | "EMPTY_IMAGE"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "IMAGE_TOO_LARGE"
  | "INVALID_CROP"
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

export type ConvertDocumentResponse =
  | { success: true; result: DocumentConversionResult }
  | {
      success: false;
      error: { code: ConversionErrorCode; message: string };
    };
