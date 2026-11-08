import { admission, clientIdentity } from "../../server/security.js";
import { parseMultipart } from "./multipart.server";
import { ConversionError } from "./errors.server";

export function admitConversion() {
  const denied = admission();
  if (denied) {
    const error = new ConversionError(
      denied.status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
      denied.message,
      denied.status,
    );
    Object.assign(error, { retryAfter: denied.retryAfter });
    throw error;
  }
}
export function errorResponse(error: ConversionError): Response {
  const retry = (error as ConversionError & { retryAfter?: number }).retryAfter;
  return Response.json(
    { success: false, error: { code: error.code, message: error.message } },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        ...(retry ? { "Retry-After": String(retry) } : {}),
      },
    },
  );
}

// Reserve the maximum possible size before reading, so slow streams cannot
// exceed the memory budget. A client may hold two reservations, independently
// of other clients. The global byte budget still protects this single process.
const uploads = new Map<string, number>();
let reservedBytes = 0;
const UPLOAD_MEMORY_BUDGET = 512 * 1024 * 1024;

export async function boundedFormData(
  request: Request,
  maximumBytes: number,
  maximumFiles = 20,
): Promise<FormData> {
  const client = clientIdentity() ?? "mock";
  if ((uploads.get(client) ?? 0) >= 2) {
    await request.body?.cancel();
    throw new ConversionError(
      "SERVICE_BUSY",
      "You already have two uploads in progress. Please try again shortly.",
      503,
    );
  }
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) {
    await request.body?.cancel();
    throw new ConversionError(
      "IMAGE_TOO_LARGE",
      "The upload exceeds the request size limit.",
      413,
    );
  }
  const reservation = maximumBytes;
  if (reservedBytes + reservation > UPLOAD_MEMORY_BUDGET) {
    await request.body?.cancel();
    throw new ConversionError(
      "SERVICE_BUSY",
      "Upload memory is busy. Please try again shortly.",
      503,
    );
  }
  let size = 0;
  const body = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > maximumBytes)
          throw new ConversionError(
            "IMAGE_TOO_LARGE",
            "The upload exceeds the request size limit.",
            413,
          );
        controller.enqueue(chunk);
      },
    }),
  );
  if (!body)
    throw new ConversionError(
      "IMAGE_REQUIRED",
      "Choose an image to convert.",
      400,
    );
  reservedBytes += reservation;
  uploads.set(client, (uploads.get(client) ?? 0) + 1);
  try {
    return await parseMultipart(
      body,
      request.headers.get("content-type") ?? "",
      maximumFiles,
    );
  } catch (error) {
    // Parser construction may fail before pipeline owns/cancels the stream.
    await body.cancel().catch(() => {});
    if (error instanceof ConversionError) throw error;
    if (size > maximumBytes)
      throw new ConversionError(
        "IMAGE_TOO_LARGE",
        "The upload exceeds the request size limit.",
        413,
      );
    throw new ConversionError(
      "INVALID_UPLOAD",
      "The multipart upload is invalid.",
      400,
    );
  } finally {
    reservedBytes -= reservation;
    const remaining = (uploads.get(client) ?? 1) - 1;
    if (remaining) uploads.set(client, remaining);
    else uploads.delete(client);
  }
}

/** Shared public conversion boundary: admission, method and safe error mapping. */
export async function handleConversion(
  request: Request,
  convert: () => Promise<Response>,
): Promise<Response> {
  if (request.method !== "POST") {
    const response = errorResponse(
      new ConversionError("INTERNAL_ERROR", "Method not allowed.", 405),
    );
    response.headers.set("Allow", "POST");
    return response;
  }
  try {
    admitConversion();
    return await convert();
  } catch (error) {
    if (error instanceof ConversionError) return errorResponse(error);
    console.error(
      "Conversion failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return errorResponse(
      new ConversionError(
        "INTERNAL_ERROR",
        "The conversion could not be completed.",
        500,
      ),
    );
  }
}
