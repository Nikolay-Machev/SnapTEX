import { z } from "zod";

export const supportedImageTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type SupportedImageType = (typeof supportedImageTypes)[number];
export const cropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((crop) => crop.x + crop.width <= 1 && crop.y + crop.height <= 1);
export type EquationCrop = z.infer<typeof cropSchema>;
export type EquationImage = {
  bytes: Uint8Array;
  mimeType: SupportedImageType;
  crop?: EquationCrop;
};
export const warningSchema = z.object({
  code: z.enum([
    "AMBIGUOUS_SYMBOL",
    "UNREADABLE_REGION",
    "MULTIPLE_EQUATIONS",
    "TEXT_OCR_UNAVAILABLE",
    "PAGE_ROTATED",
  ]),
  message: z.string().min(1),
  page: z.number().int().positive().optional(),
  region: z.number().int().positive().optional(),
  crop: cropSchema.optional(),
});
export type ConversionWarning = z.infer<typeof warningSchema>;
export const conversionResultSchema = z.object({
  latex: z.string().trim().min(1),
  confidence: z.number().nullable(),
  warnings: z.array(warningSchema),
  provider: z.string(),
});
export type ConversionResult = z.infer<typeof conversionResultSchema>;
const blockFields = {
  id: z.string(),
  content: z.string(),
  page: z.number().int().positive(),
  order: z.number().int().nonnegative(),
  confidence: z.number().nullable(),
};
export const documentBlockSchema = z.discriminatedUnion("type", [
  z.object({ ...blockFields, type: z.literal("text") }),
  z.object({ ...blockFields, type: z.literal("display-math") }),
  z.object({
    ...blockFields,
    type: z.literal("figure"),
    asset: z.object({ path: z.string(), dataUrl: z.string() }),
  }),
]);
export type DocumentBlock = z.infer<typeof documentBlockSchema>;
export type DocumentBlockType = DocumentBlock["type"];
export const pageResultSchema = z.object({
  blocks: z.array(documentBlockSchema),
  warnings: z.array(warningSchema),
  provider: z.string(),
});
export type PageRecognitionResult = z.infer<typeof pageResultSchema>;
export const documentResultSchema = pageResultSchema.extend({
  latex: z.string(),
  pageCount: z.number().int().positive(),
});
export type DocumentConversionResult = z.infer<typeof documentResultSchema>;
export const conversionErrorSchema = z.object({
  code: z.enum([
    "IMAGE_REQUIRED",
    "EMPTY_IMAGE",
    "UNSUPPORTED_IMAGE_TYPE",
    "IMAGE_TOO_LARGE",
    "INVALID_CROP",
    "RECOGNITION_FAILED",
    "INVALID_MODEL_OUTPUT",
    "RATE_LIMITED",
    "INTERNAL_ERROR",
    "INVALID_UPLOAD",
    "UNSUPPORTED_PROVIDER",
    "SERVICE_BUSY",
  ]),
  message: z.string(),
});
export type ConversionErrorCode = z.infer<typeof conversionErrorSchema>["code"];
const failureSchema = z.object({
  success: z.literal(false),
  error: conversionErrorSchema,
});
export const convertResponseSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), result: conversionResultSchema }),
  failureSchema,
]);
export const convertDocumentResponseSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), result: documentResultSchema }),
  failureSchema,
]);
export type ConvertResponse = z.infer<typeof convertResponseSchema>;
export type ConvertDocumentResponse = z.infer<
  typeof convertDocumentResponseSchema
>;
export interface EquationRecognizer {
  recognize(image: EquationImage): Promise<ConversionResult>;
}
export interface PageRecognizer {
  recognizePage(
    image: EquationImage,
    page: number,
    signal?: AbortSignal,
  ): Promise<PageRecognitionResult>;
}
