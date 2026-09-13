import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LocalRecognizer } from "../app/recognition/local-recognizer.server";
import { LocalRecognitionError } from "../app/recognition/local-recognizer.server";
import { characterErrorRate } from "./evaluation";

type Crop = { x: number; y: number; width: number; height: number };
type Fixture = { file: string; expectedLatex: string; crop?: Crop };

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const fixtureDirectory = resolve(projectDirectory, "tests/fixtures/equations");
const argumentsByName = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (name?.startsWith("--") && value) argumentsByName.set(name, value);
}
const maxCer = Number(argumentsByName.get("--max-cer") ?? "Infinity");
const maxErrors = Number(argumentsByName.get("--max-errors") ?? "Infinity");
const manifestName = argumentsByName.get("--manifest") ?? "manifest.json";
const cropMode = argumentsByName.get("--crop-mode") ?? "automatic";
if (!new Set(["automatic", "manual"]).has(cropMode)) {
  throw new Error("--crop-mode must be automatic or manual.");
}
const fixtures = JSON.parse(
  await readFile(resolve(fixtureDirectory, manifestName), "utf8"),
) as Fixture[];
if (Number.isNaN(maxCer) || Number.isNaN(maxErrors)) {
  throw new Error("Evaluation thresholds must be numbers.");
}
const recognizer = new LocalRecognizer();
const results = [];

console.log(`Evaluating ${fixtures.length} images with the local service...\n`);

for (const [index, fixture] of fixtures.entries()) {
  try {
    const result = await recognizer.recognize({
      bytes: await readFile(resolve(fixtureDirectory, fixture.file)),
      mimeType: "image/jpeg",
      crop: cropMode === "manual" ? fixture.crop : undefined,
    });
    const cer = characterErrorRate(fixture.expectedLatex, result.latex);
    results.push({ ...fixture, predictedLatex: result.latex, cer, error: null });
    console.log(`${index + 1}. ${fixture.file}: CER ${(cer * 100).toFixed(1)}%`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic = error instanceof LocalRecognitionError
      ? { rawLatex: error.rawLatex, rejectionReason: error.reason }
      : { rawLatex: null, rejectionReason: null };
    results.push({
      ...fixture,
      predictedLatex: null,
      cer: 1,
      error: message,
      ...diagnostic,
    });
    console.error(`${index + 1}. ${fixture.file}: ${message}`);
  }
}

const averageCer =
  results.reduce((sum, result) => sum + result.cer, 0) / results.length;
const exactMatches = results.filter((result) => result.cer === 0).length;
const errorCount = results.filter((result) => result.error !== null).length;
const report = {
  generatedAt: new Date().toISOString(),
  provider: "local",
  cropMode,
  manifest: manifestName,
  averageCer,
  exactMatches,
  errorCount,
  failures: results.filter((result) => result.cer > 0),
  results,
};
const outputDirectory = resolve(projectDirectory, "evaluation-results");
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, `local-${Date.now()}.json`);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\nAverage CER: ${(averageCer * 100).toFixed(1)}%`);
console.log(`Exact matches: ${exactMatches}/${results.length}`);
console.log(`Request errors: ${errorCount}`);
console.log(`Report: ${outputPath}`);

if (averageCer > maxCer || errorCount > maxErrors) {
  console.error(
    `Evaluation gate failed (CER <= ${maxCer}, errors <= ${maxErrors}).`,
  );
  process.exitCode = 1;
}
