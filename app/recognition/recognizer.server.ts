import type { EquationRecognizer } from "./types";
import { MockRecognizer } from "./mock-recognizer.server";
import { OpenAIRecognizer } from "./openai-recognizer.server";

export function createEquationRecognizer(): EquationRecognizer {
  const provider = process.env.RECOGNITION_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockRecognizer();
    case "openai":
      return new OpenAIRecognizer();
    default:
      throw new Error(`Unsupported recognition provider: ${provider}`);
  }
}

export const equationRecognizer = createEquationRecognizer();
