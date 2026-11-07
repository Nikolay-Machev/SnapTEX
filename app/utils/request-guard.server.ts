import { admission } from '../../server/security.mjs';
import { ConversionError } from './errors.server';

export function admitConversion() {
  const denied = admission();
  if (denied) {
    const error = new ConversionError(denied.status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR', denied.message, denied.status);
    Object.assign(error, { retryAfter: denied.retryAfter });
    throw error;
  }
}
export function errorResponse(error: ConversionError): Response {
  const retry = (error as ConversionError & { retryAfter?: number }).retryAfter;
  return Response.json({ success: false, error: { code: error.code, message: error.message } }, {
    status: error.status, headers: { 'Cache-Control': 'no-store', ...(retry ? { 'Retry-After': String(retry) } : {}) },
  });
}

let readingUploads = 0;

export async function boundedFormData(request: Request, maximumBytes: number): Promise<FormData> {
  if (readingUploads >= 2) {
    await request.body?.cancel();
    throw new ConversionError('SERVICE_BUSY', 'Two uploads are already being read. Please try again shortly.', 503);
  }
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) {
    await request.body?.cancel();
    throw new ConversionError('IMAGE_TOO_LARGE', 'The upload exceeds the request size limit.', 413);
  }
  let size = 0;
  const body = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maximumBytes) throw new ConversionError('IMAGE_TOO_LARGE', 'The upload exceeds the request size limit.', 413);
      controller.enqueue(chunk);
    },
  }));
  if (!body) throw new ConversionError('IMAGE_REQUIRED', 'Choose an image to convert.', 400);
  const bounded = new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } });
  readingUploads++;
  try { return await bounded.formData(); }
  catch (error) {
    if (error instanceof ConversionError) throw error;
    if (size > maximumBytes) throw new ConversionError('IMAGE_TOO_LARGE', 'The upload exceeds the request size limit.', 413);
    throw new ConversionError('INVALID_UPLOAD', 'The multipart upload is invalid.', 400);
  } finally { readingUploads--; }
}
