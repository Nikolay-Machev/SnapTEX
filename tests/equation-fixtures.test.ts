import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type Fixture = { file: string; expectedLatex: string };

describe("equation evaluation fixtures", () => {
  it("contains ten labeled JPEG images", async () => {
    const testDirectory = dirname(fileURLToPath(import.meta.url));
    const fixtureDirectory = resolve(testDirectory, "fixtures/equations");
    const fixtures = JSON.parse(
      await readFile(resolve(fixtureDirectory, "manifest.json"), "utf8"),
    ) as Fixture[];

    expect(fixtures).toHaveLength(10);
    expect(new Set(fixtures.map(({ file }) => file)).size).toBe(10);

    for (const fixture of fixtures) {
      expect(fixture.file).toMatch(/\.jpeg$/);
      expect(fixture.expectedLatex.trim()).not.toBe("");
      await expect(access(resolve(fixtureDirectory, fixture.file))).resolves.toBe(
        undefined,
      );
    }
  });
});
