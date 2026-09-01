import type {
  ConversionResult,
  EquationImage,
  EquationRecognizer,
} from "./types";

export class MockRecognizer implements EquationRecognizer {
  async recognize(_image: EquationImage): Promise<ConversionResult> {
    return {
      latex: String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
      confidence: null,
      warnings: [],
      provider: "mock",
    };
  }
}

