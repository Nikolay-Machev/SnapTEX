import busboy from "busboy";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ConversionError } from "./errors.server";
import { MAX_IMAGE_SIZE } from "./image-validation.server";

/** Streaming multipart parsing, with independent file/count/field limits. */
export async function parseMultipart(
  body: ReadableStream<Uint8Array>,
  contentType: string,
  files: number,
): Promise<FormData> {
  const form = new FormData();
  const parser = busboy({
    headers: { "content-type": contentType },
    limits: {
      fileSize: MAX_IMAGE_SIZE + 1,
      files,
      fields: 16,
      fieldSize: 64 * 1024,
      parts: files + 16,
    },
  });
  const excessive = () =>
    parser.destroy(
      new ConversionError(
        "IMAGE_TOO_LARGE",
        "The upload exceeds its file, field or count limit.",
        413,
      ),
    );
  parser.on("file", (name, stream, info) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("limit", excessive);
    stream.on("error", () => {}); // pipeline reports the originating parser error
    stream.on("end", () => {
      if (!stream.truncated)
        form.append(
          name,
          new File([Buffer.concat(chunks)], info.filename ?? "upload", {
            type: info.mimeType,
          }),
        );
    });
  });
  parser.on("field", (name, value, info) => {
    if (info.valueTruncated || info.nameTruncated) excessive();
    else form.append(name, value);
  });
  parser.on("filesLimit", excessive);
  parser.on("fieldsLimit", excessive);
  parser.on("partsLimit", excessive);
  await pipeline(
    Readable.fromWeb(
      body as import("node:stream/web").ReadableStream<Uint8Array>,
    ),
    parser,
  );
  return form;
}
