import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { OpenAIRecognizer } from "../app/recognition/openai-recognizer.server";

type Fixture = { file: string; expectedLatex: string };

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY before running the live evaluation.");
  process.exit(1);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(
  scriptDirectory,
  "../tests/fixtures/equations",
);
const fixtures = JSON.parse(
  await readFile(resolve(fixtureDirectory, "manifest.json"), "utf8"),
) as Fixture[];
const recognizer = new OpenAIRecognizer();

console.log(`Evaluating ${fixtures.length} equation images...\n`);

for (const [index, fixture] of fixtures.entries()) {
  const bytes = await readFile(resolve(fixtureDirectory, fixture.file));
  const result = await recognizer.recognize({
    bytes,
    mimeType: "image/jpeg",
  });

  console.log(`${index + 1}. ${fixture.file}`);
  console.log(`   expected: ${fixture.expectedLatex}`);
  console.log(`   predicted: ${result.latex}`);
  console.log(`   warnings: ${result.warnings.length ? JSON.stringify(result.warnings) : "none"}\n`);
}
