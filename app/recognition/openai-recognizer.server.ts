import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type {
  ConversionResult,
  EquationImage,
  EquationRecognizer,
} from "./types";

const recognitionOutputSchema = z.object({
  latex: z.string().min(1),
  warnings: z.array(
    z.object({
      code: z.enum([
        "AMBIGUOUS_SYMBOL",
        "UNREADABLE_REGION",
        "MULTIPLE_EQUATIONS",
      ]),
      message: z.string().min(1),
    }),
  ),
});

const instructions = `You are the OCR component of SnapTEX. Transcribe the mathematical
content in the supplied image into clean LaTeX.

- Transcribe; do not solve, simplify, explain, or add missing mathematics.
- Return only the expression body in latex, without Markdown fences or math delimiters.
- Preserve fractions, roots, scripts, matrices, alignment, and line breaks.
- Use standard LaTeX commands and braced arguments.
- Add a warning for genuinely ambiguous symbols, unreadable regions, or multiple equations.
- Never guess silently. Make the best transcription possible and describe uncertainty in warnings.`;

export type OpenAIRecognizerOptions = {
  apiKey?: string;
  client?: OpenAI;
  model?: string;
};

export class OpenAIRecognizer implements EquationRecognizer {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIRecognizerOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

    if (!options.client && !apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required when RECOGNITION_PROVIDER=openai.",
      );
    }

    this.client = options.client ?? new OpenAI({ apiKey });
    this.model = options.model ?? process.env.OPENAI_VISION_MODEL ?? "gpt-5.6-sol";
  }

  async recognize(image: EquationImage): Promise<ConversionResult> {
    const imageUrl = `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`;
    const response = await this.client.responses.parse({
      model: this.model,
      instructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Transcribe the equation in this image.",
            },
            { type: "input_image", image_url: imageUrl, detail: "high" },
          ],
        },
      ],
      text: {
        format: zodTextFormat(recognitionOutputSchema, "equation_recognition"),
      },
    });

    const output = response.output_parsed;
    if (!output) {
      throw new Error("OpenAI returned no structured recognition result.");
    }

    return {
      latex: output.latex.trim(),
      confidence: null,
      warnings: output.warnings,
      provider: `openai:${this.model}`,
    };
  }
}
