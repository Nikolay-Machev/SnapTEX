import type { ConversionErrorCode } from "~/recognition/types";

export class ConversionError extends Error {
  constructor(
    public readonly code: ConversionErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

