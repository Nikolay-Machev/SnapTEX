import { useState } from "react";
import type { HistoryEntry } from "~/utils/conversion-history";

export function ConversionHistory({ entries, ready, error, disabled, onOpen, onDelete, onClear }: {
  entries: HistoryEntry[];
  ready: boolean;
  error: string;
  disabled: boolean;
  onOpen: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const matching = entries.filter((entry) => `${entry.files.map((file) => file.name).join(" ")} ${entry.latex} ${entry.result.latex}`.toLowerCase().includes(query.toLowerCase()));
  return <details className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer font-semibold text-slate-900">Conversion history ({entries.length})</summary>
    <p className="mt-3 text-sm text-slate-600">Photos and LaTeX are saved in this browser on this device. Clearing browser data removes them. New conversions save automatically; use Save edits to keep corrections.</p>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    {!ready ? <p role="status" className="mt-3 text-sm">Loading history…</p> : <>
      <div className="mt-3 flex flex-wrap gap-3">
        <input aria-label="Search conversion history" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filenames or LaTeX" className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 text-sm" />
        {entries.length > 0 && <button type="button" disabled={disabled} onClick={() => setConfirmClear(true)} className="text-sm font-semibold text-rose-700 disabled:opacity-50">Clear history</button>}
      </div>
      {confirmClear && <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span>Delete all saved conversions from this browser?</span>
        <button type="button" disabled={disabled} onClick={() => { onClear(); setConfirmClear(false); }} className="font-semibold text-rose-700">Delete all</button>
        <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button>
      </div>}
      <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {matching.map((entry) => <li key={entry.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <button type="button" disabled={disabled} onClick={() => onOpen(entry)} className="min-w-0 flex-1 text-left disabled:opacity-50">
            <span className="block truncate text-sm font-semibold text-violet-700">{entry.files.map((file) => file.name).join(", ") || "Untitled conversion"}</span>
            <span className="block text-xs text-slate-500">{entry.mode === "document" ? "Document" : "Equation"} · {new Date(entry.createdAt).toLocaleString()}</span>
            <code className="mt-1 block truncate text-xs text-slate-700">{entry.latex}</code>
          </button>
          <button type="button" disabled={disabled} aria-label={`Delete conversion ${entry.files[0]?.name ?? entry.id}`} onClick={() => onDelete(entry.id)} className="text-sm text-rose-700 disabled:opacity-50">Delete</button>
        </li>)}
      </ul>
      {matching.length === 0 && <p className="mt-3 text-sm text-slate-500">{entries.length ? "No matching conversions." : "Your next successful conversion will appear here."}</p>}
    </>}
  </details>;
}
