import { admitConversion, boundedFormData, errorResponse } from "~/utils/request-guard.server";
import type { ConvertResponse } from "~/recognition/types";
import { convertEquation } from "~/services/conversion-service.server";
import { ConversionError } from "~/utils/errors.server";

import type { Route } from "./+types/api.convert";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Method not allowed." },
      } satisfies ConvertResponse,
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  try {
    admitConversion();
    const formData = await boundedFormData(request, 8 * 1024 * 1024 + 64 * 1024);
    const result = await convertEquation(formData.get("image"), formData.get("crop"));

    return Response.json({ success: true, result } satisfies ConvertResponse);
  } catch (error) {
    if (error instanceof ConversionError) {
      return errorResponse(error);
    }

    console.error("Unexpected conversion error", error);

    return Response.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        },
      } satisfies ConvertResponse,
      { status: 500 },
    );
  }
}
