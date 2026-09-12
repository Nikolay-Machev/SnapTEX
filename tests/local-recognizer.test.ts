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
    const submitted = fetch.mock.calls[0]?.[1]?.body as FormData;
    expect(submitted.get("crop")).toBeNull();
  });

  it("forwards the optional manual crop", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({ latex: "x=1", model: "test-model" }),
    );
    const recognizer = new LocalRecognizer({ fetch });

    await recognizer.recognize({
      bytes: new Uint8Array([1]),
      mimeType: "image/png",
      crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.4 },
    });

    const submitted = fetch.mock.calls[0]?.[1]?.body as FormData;
    expect(JSON.parse(String(submitted.get("crop")))).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.6,
      height: 0.4,
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

  it("labels results from the fine-tuned SnapTEX provider", async () => {
    const recognizer = new LocalRecognizer({
      providerName: "snaptex",
      fetch: vi.fn().mockResolvedValue(
        Response.json({ latex: "x^2", model: "snaptex-trocr-v0.1" }),
      ),
    });

    const result = await recognizer.recognize({
      bytes: new Uint8Array([137, 80, 78, 71]),
      mimeType: "image/png",
    });

    expect(result.provider).toBe("snaptex:snaptex-trocr-v0.1");
  });

  it("rejects malformed model output", async () => {
    const recognizer = new LocalRecognizer({
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ latex: "" }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    });

    await expect(
      recognizer.recognize({
        bytes: new Uint8Array([255, 216, 255]),
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow("invalid output");
  });
});
