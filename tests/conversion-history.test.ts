import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { clearHistory, deleteHistory, listHistory, saveHistory, type HistoryEntry } from "../app/utils/conversion-history";

function entry(id: string, createdAt = "2026-10-22T12:00:00.000Z"): HistoryEntry {
  return {
    id, createdAt, mode: "equation", files: [],
    crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.3 },
    result: { latex: "x^2", confidence: null, warnings: [], provider: "snaptex:phone-v05" },
    latex: "x^2", blocks: [], documentEdited: false,
  };
}

beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); });

describe("conversion history", () => {
  it("persists separate conversions newest first, including identical outputs", async () => {
    await saveHistory(entry("old"));
    await saveHistory(entry("new", "2026-10-23T12:00:00.000Z"));
    expect((await listHistory()).map((item) => item.id)).toEqual(["new", "old"]);
    expect((await listHistory())[0].crop).toEqual(entry("new").crop);
  });

  it("updates edited source while retaining the generated version", async () => {
    const item = entry("one");
    await saveHistory(item);
    await saveHistory({ ...item, latex: "x^3" });
    const saved = await listHistory();
    expect(saved).toHaveLength(1);
    expect(saved[0].latex).toBe("x^3");
    expect(saved[0].result.latex).toBe("x^2");
  });

  it("retains document figure assets and prose edits across storage reads", async () => {
    const item = entry("document");
    item.mode = "document";
    item.blocks = [{ id: "figure-1", type: "figure", content: "Graph", page: 1, order: 1, confidence: null,
      asset: { path: "figures/graph.png", dataUrl: "data:image/png;base64,aGVsbG8=" } }];
    item.result = { ...item.result, pageCount: 1, blocks: item.blocks };
    item.documentEdited = true;
    await saveHistory(item);
    expect((await listHistory())[0]).toEqual(item);
  });

  it("deletes one entry without deleting the others and supports clearing all", async () => {
    await saveHistory(entry("one"));
    await saveHistory(entry("two"));
    await deleteHistory("one");
    expect((await listHistory()).map((item) => item.id)).toEqual(["two"]);
    await clearHistory();
    expect(await listHistory()).toEqual([]);
  });

  it("reports storage failures to the caller instead of pretending to save", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("Storage disabled"); } });
    await expect(saveHistory(entry("one"))).rejects.toThrow("Storage disabled");
  });
});
