import type { EquationRecognizer } from "./types";
import { LocalRecognizer } from "./local-recognizer.server";
import { MockRecognizer } from "./mock-recognizer.server";
import { OpenAIRecognizer } from "./openai-recognizer.server";

export function createEquationRecognizer(): EquationRecognizer {
  const provider = process.env.RECOGNITION_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockRecognizer();
    case "local":
      return new LocalRecognizer();
    case "openai":
      return new OpenAIRecognizer();
    default:
      throw new Error(`Unsupported recognition provider: ${provider}`);
  }
}

export const equationRecognizer = createEquationRecognizer();
