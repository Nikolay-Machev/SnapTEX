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

function isLocalRecognitionResponse(
  value: unknown,
): value is LocalRecognitionResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.latex === "string" &&
    (candidate.model === undefined || typeof candidate.model === "string") &&
    (candidate.warnings === undefined || Array.isArray(candidate.warnings))
  );
}

export type LocalRecognizerOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  providerName?: "local" | "snaptex";
  timeoutMs?: number;
};

export class LocalRecognizer implements EquationRecognizer {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly providerName: "local" | "snaptex";
  private readonly timeoutMs: number;

  constructor(options: LocalRecognizerOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.LOCAL_RECOGNITION_URL ??
      "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.providerName = options.providerName ?? "local";
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

    let output: unknown;
    try {
      output = await response.json();
    } catch {
      throw new Error("Local recognition service returned invalid JSON.");
    }
    if (!isLocalRecognitionResponse(output) || !output.latex.trim()) {
      throw new Error("Local recognition service returned invalid output.");
    }

    return {
      latex: output.latex.trim(),
      confidence: null,
      warnings: output.warnings ?? [],
      provider: `${this.providerName}:${output.model ?? "unknown"}`,
    };
  }
}
