import { describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import { action } from "../app/routes/api.convert";

describe("POST /api/convert", () => {
  it("runs a multipart image through the mock recognizer", async () => {
    const formData = new FormData();
    formData.set(
      "image",
      new File([new Uint8Array([137, 80, 78, 71])], "equation.png", {
        type: "image/png",
      }),
    );

    const request = new Request("http://localhost/api/convert", {
      method: "POST",
      body: formData,
    });

    const response = await action({
      request,
      params: {},
      context: new RouterContextProvider(),
      url: new URL(request.url),
      pattern: "/api/convert",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      result: {
        provider: "mock",
        confidence: null,
        warnings: [],
      },
    });
    expect(body.result.latex).toContain("\\frac");
  });

  it("returns a typed error when the image is missing", async () => {
    const request = new Request("http://localhost/api/convert", {
      method: "POST",
      body: new FormData(),
    });

    const response = await action({
      request,
      params: {},
      context: new RouterContextProvider(),
      url: new URL(request.url),
      pattern: "/api/convert",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: "IMAGE_REQUIRED",
        message: "Choose an equation image to convert.",
      },
    });
  });
});
