// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  clearHistory,
  listHistory,
  saveHistory,
  type HistoryEntry,
} from "../app/utils/conversion-history";

const state = vi.hoisted(() => ({
  data: undefined as unknown,
  submit: vi.fn(),
}));
vi.mock("react-router", async () => {
  const React = await import("react");
  return {
    useFetcher: () => ({
      state: "idle",
      data: state.data,
      submit: state.submit,
      Form: (props: Record<string, unknown>) =>
        React.createElement("form", props),
    }),
  };
});
import Home from "../app/routes/home";

let root: Root;
let container: HTMLDivElement;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
  await settle();
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.data = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await clearHistory();
  vi.unstubAllGlobals();
});

it("reopens edited history, restores the generated text, and saves to the same record", async () => {
  const item: HistoryEntry = {
    id: "saved",
    createdAt: "2026-10-22T12:00:00Z",
    mode: "equation",
    files: [],
    result: {
      latex: "x^2",
      warnings: [],
      provider: "phone-v05",
      confidence: null,
    },
    latex: "x^3",
    blocks: [],
    documentEdited: false,
  };
  await saveHistory(item);
  await act(async () => root.render(createElement(Home)));
  await settle();
  expect(container.textContent).toContain("Your documents (1)");
  await click("Untitled conversion");
  expect(container.querySelector("textarea")!.value).toBe("x^3");
  await click("Restore generated LaTeX");
  expect(container.querySelector("textarea")!.value).toBe("x^2");
  await click("Save");
  const saved = await listHistory();
  expect(saved).toHaveLength(1);
  expect(saved[0].latex).toBe("x^2");
});

it("automatically saves successful results and does not duplicate them on rerender", async () => {
  await act(async () => root.render(createElement(Home)));
  await settle();
  state.data = {
    success: true,
    result: {
      latex: "y=x",
      warnings: [],
      provider: "phone-v05",
      confidence: null,
    },
  };
  await act(async () => root.render(createElement(Home)));
  await settle();
  expect((await listHistory())[0].latex).toBe("y=x");
  await act(async () => root.render(createElement(Home)));
  await settle();
  expect(await listHistory()).toHaveLength(1);
});

it("prevents PDF export of stale blocks after freeform document source edits", async () => {
  const item: HistoryEntry = {
    id: "edited-document",
    createdAt: "2026-10-22T12:00:00Z",
    mode: "document",
    files: [],
    result: {
      latex: "original source",
      warnings: [],
      provider: "phone-v05",
      blocks: [],
      pageCount: 1,
    },
    latex: "edited source",
    blocks: [
      {
        id: "math",
        type: "display-math",
        content: "x=1",
        page: 1,
        order: 1,
        confidence: null,
      },
    ],
    documentEdited: true,
  };
  await saveHistory(item);
  await act(async () => root.render(createElement(Home)));
  await settle();
  await click("Untitled conversion");
  const savePdf = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Save PDF",
  );
  expect(savePdf?.disabled).toBe(true);
  expect(container.textContent).toContain("PDF export is paused");
});

it("saves a titled draft without a conversion and reopens it from the sidebar", async () => {
  await act(async () => root.render(createElement(Home)));
  await settle();
  function change(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
  await act(async () => {
    change(
      container.querySelector("#document-title")!,
      "Electromagnetism notes",
    );
    change(container.querySelector("textarea")!, "E=mc^2");
  });
  await click("Save");
  const stored = await listHistory();
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({
    title: "Electromagnetism notes",
    latex: "E=mc^2",
  });
  expect(container.textContent).toContain("Saved in this browser");
  await click("New document");
  expect(container.querySelector("textarea")!.value).toBe("");
  await click("Electromagnetism notes");
  expect(container.querySelector("textarea")!.value).toBe("E=mc^2");
  expect(
    (container.querySelector("#document-title") as HTMLInputElement).value,
  ).toBe("Electromagnetism notes");
  expect(container.querySelector("header")?.textContent).toContain(
    "Download project ZIP",
  );
  expect(container.querySelector('aside [aria-current="true"]')).toBeTruthy();
});
