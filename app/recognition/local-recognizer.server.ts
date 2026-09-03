import type {
  ConversionResult,
  EquationImage,
  EquationRecognizer,
} from "./types";

type LocalRecognitionResponse = {
  latex: string;
  warnings?: ConversionResult["warnings"];
  model?: string;
};

export type LocalRecognizerOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class LocalRecognizer implements EquationRecognizer {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: LocalRecognizerOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.LOCAL_RECOGNITION_URL ??
      "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async recognize(image: EquationImage): Promise<ConversionResult> {
    const formData = new FormData();
    formData.set(
      "image",
      new Blob([image.bytes as BlobPart], { type: image.mimeType }),
      "equation",
    );

    const response = await this.fetch(`${this.baseUrl}/recognize`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Local recognition service returned HTTP ${response.status}.`);
    }

    const output = (await response.json()) as LocalRecognitionResponse;
    if (typeof output.latex !== "string" || !output.latex.trim()) {
      throw new Error("Local recognition service returned invalid output.");
    }

    return {
      latex: output.latex.trim(),
      confidence: null,
      warnings: output.warnings ?? [],
      provider: `local:${output.model ?? "unknown"}`,
    };
  }
}
