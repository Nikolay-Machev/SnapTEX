import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { OpenAIRecognizer } from "../app/recognition/openai-recognizer.server";

describe("OpenAIRecognizer", () => {
  it("sends a high-detail image and normalizes structured output", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: {
        latex: String.raw` e^{i\pi} + 1 = 0 `,
        warnings: [
          {
            code: "AMBIGUOUS_SYMBOL",
            message: "The exponent is faint.",
          },
        ],
      },
    });
    const client = { responses: { parse } } as unknown as OpenAI;
    const recognizer = new OpenAIRecognizer({ client, model: "test-model" });

    const result = await recognizer.recognize({
      bytes: new Uint8Array([255, 216, 255]),
      mimeType: "image/jpeg",
    });

    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0][0]).toMatchObject({
      model: "test-model",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text" },
            {
              type: "input_image",
              detail: "high",
              image_url: "data:image/jpeg;base64,/9j/",
            },
          ],
        },
      ],
      text: { format: { type: "json_schema" } },
    });
    expect(result).toEqual({
      latex: String.raw`e^{i\pi} + 1 = 0`,
      confidence: null,
      warnings: [
        {
          code: "AMBIGUOUS_SYMBOL",
          message: "The exponent is faint.",
        },
      ],
      provider: "openai:test-model",
    });
  });

  it("requires an API key when no client is injected", () => {
    expect(
      () => new OpenAIRecognizer({ apiKey: "", model: "test-model" }),
    ).toThrow("OPENAI_API_KEY is required");
  });
});
