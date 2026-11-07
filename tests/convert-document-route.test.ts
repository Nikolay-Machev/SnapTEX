import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documentJobs } from "../app/services/document-jobs.server";
import { afterAll, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import { action } from "../app/routes/api.convert-document";

const directory = await mkdtemp(join(tmpdir(), "snaptex-route-jobs-"));
process.env.SNAPTEX_JOB_DIRECTORY = directory;
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

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
        new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHosAAAAASUVORK5CYII=", "base64")], name, { type: "image/png" }),
      );
    }
    const request = new Request("http://localhost/api/convert-document", {
      method: "POST",
      body: formData,
    });
    const response = await action(actionArgs(request));
    const body = await response.json();

    expect(response.status).toBe(202);
    let job = await documentJobs().get(body.job.id, body.job.token);
    for (let i = 0; job?.status !== "succeeded" && i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      job = await documentJobs().get(body.job.id, body.job.token);
    }
    expect(job?.status).toBe("succeeded");
    body.result = job!.result;
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
