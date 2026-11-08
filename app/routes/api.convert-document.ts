import { clientIdentity } from "../../server/security.js";
import { documentJobs } from "~/services/document-jobs.server";
import { ConversionError } from "~/utils/errors.server";
import { validateEquationImage } from "~/utils/image-validation.server";
import {
  boundedFormData,
  handleConversion,
} from "~/utils/request-guard.server";
import type { Route } from "./+types/api.convert-document";

export async function action({ request }: Route.ActionArgs) {
  return handleConversion(request, async () => {
    const provider = process.env.RECOGNITION_PROVIDER ?? "mock";
    if (!["mock", "local", "snaptex"].includes(provider))
      throw new ConversionError(
        "UNSUPPORTED_PROVIDER",
        `Document mode is unavailable with provider '${provider}'. Choose local or snaptex.`,
        503,
      );
    const form = await boundedFormData(
      request,
      20 * 8 * 1024 * 1024 + 256 * 1024,
    );
    const files = form.getAll("images");
    if (!files.length)
      throw new ConversionError(
        "IMAGE_REQUIRED",
        "Choose at least one page image.",
        400,
      );
    if (files.length > 20)
      throw new ConversionError(
        "IMAGE_TOO_LARGE",
        "A document can contain at most 20 pages.",
        413,
      );
    const images = await Promise.all(
      files.map((file) => validateEquationImage(file)),
    );
    const job = await documentJobs().create(images, clientIdentity() ?? "mock");
    return Response.json(
      { success: true, job },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  });
}
