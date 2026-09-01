import type { EquationRecognizer } from "./types";
import { MockRecognizer } from "./mock-recognizer.server";

export function createEquationRecognizer(): EquationRecognizer {
  const provider = process.env.RECOGNITION_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockRecognizer();
    default:
      throw new Error(`Unsupported recognition provider: ${provider}`);
  }
}

export const equationRecognizer = createEquationRecognizer();

