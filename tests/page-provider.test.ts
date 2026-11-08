import { afterEach, expect, it, vi } from "vitest";
import { createPageRecognizer } from "../app/recognition/page-recognizer.server";
import { RecognitionServiceClient } from "../app/recognition/service-client.server";

afterEach(() => vi.unstubAllEnvs());
it("never substitutes mock pages for OpenAI or unknown providers", async () => {
  for (const provider of ["openai", "typo"]) {
    vi.stubEnv("RECOGNITION_PROVIDER", provider);
    await expect(
      createPageRecognizer().recognizePage(
        { bytes: new Uint8Array(), mimeType: "image/png" },
        1,
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_PROVIDER", status: 503 });
  }
});
it("attaches the original page and crop to unreadable-region warnings", async () => {
  const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      blocks: [],
      warnings: [
        {
          code: "UNREADABLE_REGION",
          message: "Region 4 could not be read.",
          region: 4,
          crop,
        },
      ],
      model: "test",
    }),
  );
  const result = await new RecognitionServiceClient({ fetch }).recognizePage(
    { bytes: new Uint8Array(), mimeType: "image/png" },
    2,
  );
  expect(result.warnings[0]).toMatchObject({
    page: 2,
    region: 4,
    crop,
    message: "Page 2: Region 4 could not be read.",
  });
});

it("rejects malformed upstream blocks and warnings at the shared schema boundary", async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      blocks: [{ type: "surprise", content: "x", order: 1 }],
      warnings: [],
      model: "test",
    }),
  );
  await expect(
    new RecognitionServiceClient({ fetch }).recognizePage(
      { bytes: new Uint8Array(), mimeType: "image/png" },
      1,
    ),
  ).rejects.toThrow("invalid output");
});
