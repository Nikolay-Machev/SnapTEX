import { z } from "zod";
import {
  warningSchema,
  type ConversionResult,
  type EquationImage,
  type EquationRecognizer,
  type PageRecognizer,
  type PageRecognitionResult,
} from "./types";

export class LocalRecognitionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rawLatex: string | null = null,
    readonly reason: string | null = null,
  ) {
    super(message);
    this.name = "LocalRecognitionError";
  }
}

const metadata = {
  warnings: z.array(warningSchema).default([]),
  model: z.string().default("unknown"),
};
const equationSchema = z.object({
  ...metadata,
  latex: z.string().trim().min(1),
});
const pageSchema = z.object({
  ...metadata,
  blocks: z.array(
    z.object({
      type: z.enum(["text", "display-math"]),
      content: z.string().trim(),
      order: z.number().int().nonnegative(),
      confidence: z.number().nullable().optional(),
    }),
  ),
});
export type RecognitionServiceOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  providerName?: "local" | "snaptex";
  timeoutMs?: number;
};
export class RecognitionServiceClient
  implements EquationRecognizer, PageRecognizer
{
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly provider: string;
  constructor(private options: RecognitionServiceOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.LOCAL_RECOGNITION_URL ??
      "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.provider = options.providerName ?? "local";
  }
  private async request(
    image: EquationImage,
    page?: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const form = new FormData();
    form.set(
      "image",
      new Blob([image.bytes as BlobPart], { type: image.mimeType }),
      page ? `page-${page}` : "equation",
    );
    if (!page && image.crop) form.set("crop", JSON.stringify(image.crop));
    const timeout = AbortSignal.timeout(
      this.options.timeoutMs ?? (page ? 300_000 : 120_000),
    );
    const response = await this.fetch(
      `${this.baseUrl}/${page ? "recognize-page" : "recognize"}`,
      {
        method: "POST",
        body: form,
        headers: process.env.SNAPTEX_INTERNAL_TOKEN
          ? { "X-Snaptex-Service-Token": process.env.SNAPTEX_INTERNAL_TOKEN }
          : {},
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new LocalRecognitionError(
        `Local recognition service returned HTTP ${response.status}.`,
        response.status,
        typeof body?.detail?.raw_latex === "string"
          ? body.detail.raw_latex
          : null,
        typeof body?.detail?.reason === "string" ? body.detail.reason : null,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new Error("Local recognition service returned invalid JSON.");
    }
  }
  async recognize(image: EquationImage): Promise<ConversionResult> {
    const parsed = equationSchema.safeParse(await this.request(image));
    if (!parsed.success)
      throw new Error("Local recognition service returned invalid output.");
    return {
      latex: parsed.data.latex,
      confidence: null,
      warnings: parsed.data.warnings,
      provider: `${this.provider}:${parsed.data.model}`,
    };
  }
  async recognizePage(
    image: EquationImage,
    page: number,
    signal?: AbortSignal,
  ): Promise<PageRecognitionResult> {
    const parsed = pageSchema.safeParse(
      await this.request(image, page, signal),
    );
    if (!parsed.success)
      throw new Error("Local page recognition returned invalid output.");
    return {
      blocks: parsed.data.blocks.map((block, index) => ({
        ...block,
        id: `page-${page}-block-${index + 1}`,
        page,
        confidence: block.confidence ?? null,
      })),
      warnings: parsed.data.warnings.map((warning) => ({
        ...warning,
        page,
        message: `Page ${page}: ${warning.message}`,
      })),
      provider: `${this.provider}-page:${parsed.data.model}`,
    };
  }
}
