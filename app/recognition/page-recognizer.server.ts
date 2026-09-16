import type {
  DocumentBlock,
  EquationImage,
  PageRecognitionResult,
  PageRecognizer,
} from "./types";

type LocalPageResponse = {
  blocks: Array<{
    type: "text" | "display-math";
    content: string;
    order: number;
    confidence?: number | null;
  }>;
  warnings?: PageRecognitionResult["warnings"];
  model?: string;
};

export class MockPageRecognizer implements PageRecognizer {
  async recognizePage(_image: EquationImage, page: number): Promise<PageRecognitionResult> {
    return {
      blocks: [
        {
          id: `page-${page}-block-1`,
          type: "text",
          content: `Page ${page}`,
          page,
          order: 1,
          confidence: null,
        },
        {
          id: `page-${page}-block-2`,
          type: "display-math",
          content: String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
          page,
          order: 2,
          confidence: null,
        },
      ],
      warnings: [],
      provider: "mock-page",
    };
  }
}

export class LocalPageRecognizer implements PageRecognizer {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: { baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number } = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.LOCAL_RECOGNITION_URL ??
      "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 300_000;
  }

  async recognizePage(image: EquationImage, page: number): Promise<PageRecognitionResult> {
    const formData = new FormData();
    formData.set(
      "image",
      new Blob([image.bytes as BlobPart], { type: image.mimeType }),
      `page-${page}`,
    );
    const response = await this.fetch(`${this.baseUrl}/recognize-page`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Local page recognition returned HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as LocalPageResponse;
    if (!Array.isArray(payload.blocks)) {
      throw new Error("Local page recognition returned invalid output.");
    }
    const blocks: DocumentBlock[] = payload.blocks.map((block, index) => ({
      id: `page-${page}-block-${index + 1}`,
      type: block.type,
      content: block.content.trim(),
      page,
      order: block.order,
      confidence: block.confidence ?? null,
    }));
    return {
      blocks,
      warnings: payload.warnings ?? [],
      provider: `local-page:${payload.model ?? "unknown"}`,
    };
  }
}

export function createPageRecognizer(): PageRecognizer {
  const provider = process.env.RECOGNITION_PROVIDER ?? "mock";
  return provider === "local" || provider === "snaptex"
    ? new LocalPageRecognizer()
    : new MockPageRecognizer();
}

export const pageRecognizer = createPageRecognizer();
