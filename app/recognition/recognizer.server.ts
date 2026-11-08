import type { EquationRecognizer } from "./types";
import { RecognitionServiceClient } from "./service-client.server";
import { MockRecognizer } from "./mock-recognizer.server";
import { OpenAIRecognizer } from "./openai-recognizer.server";

export function createEquationRecognizer(): EquationRecognizer {
  const provider = process.env.RECOGNITION_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockRecognizer();
    case "local":
      return new RecognitionServiceClient();
    case "snaptex":
      return new RecognitionServiceClient({ providerName: "snaptex" });
    case "openai":
      return new OpenAIRecognizer();
    default:
      throw new Error(`Unsupported recognition provider: ${provider}`);
  }
}

export const equationRecognizer = createEquationRecognizer();
