import {
  boundedFormData,
  handleConversion,
} from "~/utils/request-guard.server";
import { convertEquation } from "~/services/conversion-service.server";
import type { Route } from "./+types/api.convert";

export function action({ request }: Route.ActionArgs) {
  return handleConversion(request, async () => {
    const form = await boundedFormData(request, 8 * 1024 * 1024 + 64 * 1024, 1);
    return Response.json({
      success: true,
      result: await convertEquation(form.get("image"), form.get("crop")),
    });
  });
}
