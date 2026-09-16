import { describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import { action } from "../app/routes/api.convert-document";

function actionArgs(request: Request) {
  return {
    request,
    params: {},
    context: new RouterContextProvider(),
    url: new URL(request.url),
    pattern: "/api/convert-document",
  };
}

describe("POST /api/convert-document", () => {
  it("assembles multiple uploaded pages into editable LaTeX", async () => {
    const formData = new FormData();
    for (const name of ["one.png", "two.png"]) {
      formData.append(
        "images",
        new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" }),
      );
    }
    const request = new Request("http://localhost/api/convert-document", {
      method: "POST",
      body: formData,
    });
    const response = await action(actionArgs(request));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.pageCount).toBe(2);
    expect(body.result.blocks).toHaveLength(4);
    expect(body.result.latex).toContain("\\begin{document}");
    expect(body.result.latex).toContain("\\newpage");
  });

  it("requires at least one page", async () => {
    const request = new Request("http://localhost/api/convert-document", {
      method: "POST",
      body: new FormData(),
    });
    const response = await action(actionArgs(request));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "IMAGE_REQUIRED" },
    });
  });
});
