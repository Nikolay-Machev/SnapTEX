import { useEffect, useMemo, useState } from "react";
import type { DocumentBlock, EquationCrop } from "~/recognition/types";
import { cropFigure } from "~/utils/document-export";
import { ImageCropSelector } from "./image-crop-selector";

export function DocumentFigureEditor({ files, blocks, onChange }: {
  files: File[];
  blocks: DocumentBlock[];
  onChange: (blocks: DocumentBlock[]) => void;
}) {
  const [page, setPage] = useState(1);
  const [crop, setCrop] = useState<EquationCrop>();
  const [caption, setCaption] = useState("");
  const [after, setAfter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = files[page - 1];
  const url = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function addFigure() {
    if (!file || !crop || busy) return;
    setBusy(true);
    setError("");
    try {
      const dataUrl = await cropFigure(file, crop);
      const id = `figure-${crypto.randomUUID()}`;
      const pageBlocks = blocks.filter((block) => block.page === page)
        .sort((a, b) => a.order - b.order);
      const index = after ? pageBlocks.findIndex((block) => block.id === after) + 1 : 0;
      pageBlocks.splice(index, 0, {
        id, type: "figure", content: caption, page, order: 0, confidence: null,
        asset: { path: `figures/${id}.png`, dataUrl },
      });
      onChange([
        ...blocks.filter((block) => block.page !== page),
        ...pageBlocks.map((block, order) => ({ ...block, order })),
      ]);
      setAfter(id);
      setCrop(undefined);
      setCaption("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not crop illustration.");
    } finally { setBusy(false); }
  }

  if (!url) return null;
  return <fieldset disabled={busy} className="mt-5 space-y-3 rounded-xl border border-slate-200 p-4">
    <legend className="px-1 text-sm font-semibold">Add a graph or illustration</legend>
    <label className="block text-sm">Source page
      <select value={page} onChange={(event) => {
        setPage(Number(event.target.value)); setCrop(undefined); setAfter("");
      }} className="ml-2 rounded border p-1">
        {files.map((file, index) => <option key={index} value={index + 1}>{index + 1}: {file.name}</option>)}
      </select>
    </label>
    <ImageCropSelector imageUrl={url} purpose="figure" crop={crop} onCropChange={setCrop} />
    <label className="block text-sm">Place illustration
      <select value={after} onChange={(event) => setAfter(event.target.value)} className="mt-1 block w-full rounded border p-2">
        <option value="">At the start of this page</option>
        {blocks.filter((block) => block.page === page).sort((a, b) => a.order - b.order).map((block, index) =>
          <option key={block.id} value={block.id}>After block {index + 1}: {block.content.slice(0, 45) || "Illustration"}</option>)}
      </select>
    </label>
    <label className="block text-sm">Caption (optional)
      <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} className="mt-1 block w-full rounded border p-2" />
    </label>
    <button type="button" disabled={!crop || crop.width < 0.01 || crop.height < 0.01 || busy} onClick={addFigure} className="rounded bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? "Cropping…" : "Add cropped illustration"}
    </button>
    <p className="text-xs text-slate-500">Include the drawing’s labels in your selection. Remove any incorrect recognition blocks using the preview below.</p>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </fieldset>;
}
