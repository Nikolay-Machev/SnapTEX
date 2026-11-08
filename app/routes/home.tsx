import { useCallback, useEffect, useState } from "react";

import { ConversionHistory } from "~/components/conversion-history";
import {
  listHistory,
  saveHistory,
  deleteHistory,
  clearHistory,
  type HistoryEntry,
} from "~/utils/conversion-history";
import { ConversionWorkflow } from "~/components/conversion-workflow";
import { pendingDocumentExists } from "~/hooks/use-document-job";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "SnapTEX — Image to LaTeX" },
    {
      name: "description",
      content: "Convert equation images into clean, editable LaTeX.",
    },
  ];
}

export default function Home() {
  const [mode, setMode] = useState<"equation" | "document">("equation");
  const [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [initial, setInitial] = useState<HistoryEntry>();
  const [ready, setReady] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let active = true;
    if (pendingDocumentExists()) setMode("document");
    listHistory()
      .then((saved) => {
        if (active)
          setEntries((current) =>
            [
              ...current,
              ...saved.filter(
                (item) => !current.some((other) => other.id === item.id),
              ),
            ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          );
      })
      .catch(() => {
        if (active)
          setHistoryError(
            "History could not be loaded. Browser storage may be unavailable.",
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const storeEntry = useCallback(async (entry: HistoryEntry) => {
    // Keep the session copy usable even if durable browser storage is full.
    setEntries((current) =>
      [entry, ...current.filter((item) => item.id !== entry.id)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
    try {
      await saveHistory(entry);
      setHistoryError("");
    } catch {
      setHistoryError(
        "This conversion is available for this session, but could not be saved permanently. Download your LaTeX before closing the page.",
      );
    }
  }, []);

  async function removeEntry(id: string) {
    try {
      await deleteHistory(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setHistoryError("");
    } catch {
      setHistoryError(
        "Could not delete the saved conversion. Please try again.",
      );
    }
  }
  async function removeAll() {
    try {
      await clearHistory();
      setEntries([]);
      setHistoryError("");
    } catch {
      setHistoryError("Could not clear history. Please try again.");
    }
  }
  function reset() {
    setInitial(undefined);
    setRevision((value) => value + 1);
  }

  return (
    <ConversionWorkflow
      key={`${mode}-${revision}`}
      mode={mode}
      setMode={(next) => {
        setMode(next);
        reset();
      }}
      onReset={reset}
      initial={initial}
      onStore={storeEntry}
      onRetryRegion={(file, crop) => {
        setInitial({
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          mode: "equation",
          files: [file],
          crop,
          result: { latex: "", warnings: [], provider: "", confidence: null },
          latex: "",
          blocks: [],
          documentEdited: false,
        });
        setMode("equation");
        setRevision((value) => value + 1);
      }}
      history={{
        entries,
        ready,
        error: historyError,
        onOpen: (entry) => {
          setInitial(entry);
          setMode(entry.mode);
          setRevision((value) => value + 1);
        },
        onDelete: removeEntry,
        onClear: removeAll,
      }}
    />
  );
}
