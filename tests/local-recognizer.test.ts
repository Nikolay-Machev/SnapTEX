import { describe, expect, it, vi } from "vitest";

import { LocalRecognizer } from "../app/recognition/local-recognizer.server";

describe("LocalRecognizer", () => {
  it("sends the image to the local service and normalizes its response", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          latex: String.raw` E = mc^2 `,
          warnings: [],
          model: "test-model",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const recognizer = new LocalRecognizer({
      baseUrl: "http://model.test/",
      fetch,
      timeoutMs: 1_000,
    });

    const result = await recognizer.recognize({
      bytes: new Uint8Array([255, 216, 255]),
      mimeType: "image/jpeg",
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://model.test/recognize",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    expect(result).toEqual({
      latex: "E = mc^2",
      confidence: null,
      warnings: [],
      provider: "local:test-model",
    });
  });

  it("rejects an unsuccessful service response", async () => {
    const recognizer = new LocalRecognizer({
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    });

    await expect(
      recognizer.recognize({
        bytes: new Uint8Array([255, 216, 255]),
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow("HTTP 503");
  });
});
