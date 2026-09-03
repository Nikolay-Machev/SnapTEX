import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LocalRecognizer } from "../app/recognition/local-recognizer.server";
import { characterErrorRate } from "./evaluation";

type Fixture = { file: string; expectedLatex: string };

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const fixtureDirectory = resolve(projectDirectory, "tests/fixtures/equations");
const fixtures = JSON.parse(
  await readFile(resolve(fixtureDirectory, "manifest.json"), "utf8"),
) as Fixture[];
const recognizer = new LocalRecognizer();
const results = [];

console.log(`Evaluating ${fixtures.length} images with the local service...\n`);

for (const [index, fixture] of fixtures.entries()) {
  try {
    const result = await recognizer.recognize({
      bytes: await readFile(resolve(fixtureDirectory, fixture.file)),
      mimeType: "image/jpeg",
    });
    const cer = characterErrorRate(fixture.expectedLatex, result.latex);
    results.push({ ...fixture, predictedLatex: result.latex, cer, error: null });
    console.log(`${index + 1}. ${fixture.file}: CER ${(cer * 100).toFixed(1)}%`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ ...fixture, predictedLatex: null, cer: 1, error: message });
    console.error(`${index + 1}. ${fixture.file}: ${message}`);
  }
}

const averageCer =
  results.reduce((sum, result) => sum + result.cer, 0) / results.length;
const report = {
  generatedAt: new Date().toISOString(),
  provider: "local",
  averageCer,
  failures: results.filter((result) => result.cer > 0),
  results,
};
const outputDirectory = resolve(projectDirectory, "evaluation-results");
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, `local-${Date.now()}.json`);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\nAverage CER: ${(averageCer * 100).toFixed(1)}%`);
console.log(`Report: ${outputPath}`);
