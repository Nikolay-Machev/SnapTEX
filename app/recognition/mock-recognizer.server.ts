import type {
  ConversionResult,
  EquationImage,
  EquationRecognizer,
  PageRecognizer,
  PageRecognitionResult,
} from "./types";

export class MockRecognizer implements EquationRecognizer, PageRecognizer {
  async recognize(_image: EquationImage): Promise<ConversionResult> {
    return {
      latex: String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
      confidence: null,
      warnings: [],
      provider: "mock",
    };
  }
  async recognizePage(
    image: EquationImage,
    page: number,
  ): Promise<PageRecognitionResult> {
    const equation = await this.recognize(image);
    return {
      blocks: [
        {
          id: `page-${page}-block-1`,
          type: "text",
          content: `Page ${page}`,
          page,
          order: 1,
          confidence: null,
        },
        {
          id: `page-${page}-block-2`,
          type: "display-math",
          content: equation.latex,
          page,
          order: 2,
          confidence: null,
        },
      ],
      warnings: [],
      provider: "mock-page",
    };
  }
}
