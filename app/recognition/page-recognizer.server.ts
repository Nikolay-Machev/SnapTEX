import { ConversionError } from "~/utils/errors.server";
import { RecognitionServiceClient } from "./service-client.server";
import { MockRecognizer } from "./mock-recognizer.server";
import type { PageRecognizer } from "./types";
export function createPageRecognizer(): PageRecognizer {
  const provider = process.env.RECOGNITION_PROVIDER ?? "mock";
  switch (provider) {
    case "local":
    case "snaptex":
      return new RecognitionServiceClient({ providerName: provider });
    case "mock":
      return new MockRecognizer();
    default:
      return {
        async recognizePage() {
          throw new ConversionError(
            "UNSUPPORTED_PROVIDER",
            `Document recognition is unavailable with provider '${provider}'. Choose local or snaptex.`,
            503,
          );
        },
      };
  }
}
