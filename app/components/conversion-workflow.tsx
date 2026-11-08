import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { ConversionHistory } from "~/components/conversion-history";
import {
  listHistory,
  saveHistory,
  deleteHistory,
  clearHistory,
  type HistoryEntry,
} from "~/utils/conversion-history";
import { PaperDocument } from "~/components/paper-document";
import { documentStyles, saveDocumentPdf } from "~/utils/document-pdf";
import { UploadSelection } from "~/components/upload-selection";
import { DocumentFigureEditor } from "~/components/document-figure-editor";
import { assembleLatexDocument } from "~/services/document-assembler";
import { createDocumentArchive } from "~/utils/document-export";
import { DocumentPreview } from "~/components/document-preview";
import type {
  ConvertDocumentResponse,
  ConvertResponse,
  DocumentBlock,
  EquationCrop,
} from "~/recognition/types";

import { useDocumentJob, type JobAccepted } from "~/hooks/use-document-job";

export function ConversionWorkflow({
  mode,
  setMode,
  onReset,
  initial,
  onStore,
  history,
  onRetryRegion,
}: {
  mode: "equation" | "document";
  setMode: (mode: "equation" | "document") => void;
  onReset: () => void;
  initial?: HistoryEntry;
  onStore: (entry: HistoryEntry) => Promise<void>;
  history: Omit<Parameters<typeof ConversionHistory>[0], "disabled">;
  onRetryRegion: (file: File, crop: EquationCrop) => void;
}) {
  const fetcher = useFetcher<
    ConvertResponse | ConvertDocumentResponse | JobAccepted
  >();
  const accepted =
    fetcher.data?.success && "job" in fetcher.data
      ? fetcher.data.job
      : undefined;
  const job = useDocumentJob(mode === "document", accepted);
  const receivedResult =
    job.result ??
    (fetcher.data?.success && "result" in fetcher.data
      ? fetcher.data.result
      : undefined);
  const [files, setFiles] = useState<File[]>(initial?.files ?? []);
  const [latex, setLatex] = useState(initial?.latex ?? "");
  const [activeEntry, setActiveEntry] = useState<HistoryEntry | undefined>(
    initial,
  );
  const [result, setResult] = useState<HistoryEntry["result"] | undefined>(
    initial?.result,
  );
  const [savedEdits, setSavedEdits] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [crop, setCrop] = useState<EquationCrop | undefined>(initial?.crop);
  const [fileError, setFileError] = useState("");
  const [documentEdited, setDocumentEdited] = useState(
    initial?.documentEdited ?? false,
  );
  const [documentBlocks, setDocumentBlocks] = useState<DocumentBlock[]>(
    initial?.blocks ?? [],
  );
  const [documentFiles, setDocumentFiles] = useState<File[]>(
    initial?.files ?? [],
  );
  const [exportError, setExportError] = useState("");
  const [preparingPdf, setPreparingPdf] = useState(false);
  const outputBlocks: DocumentBlock[] =
    mode === "document"
      ? documentBlocks
      : latex.trim()
        ? [
            {
              id: "equation-output",
              type: "display-math",
              content: latex,
              page: 1,
              order: 1,
              confidence: null,
            },
          ]
        : [];

  async function exportPdf() {
    setPreparingPdf(true);
    setExportError("");
    try {
      await saveDocumentPdf(outputBlocks);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Could not prepare the PDF. Please try again.",
      );
    } finally {
      setPreparingPdf(false);
    }
  }

  const imageUrl = useMemo(
    () => (files[0] ? URL.createObjectURL(files[0]) : null),
    [files],
  );

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (receivedResult) {
      const nextResult = receivedResult;
      const blocks = "blocks" in nextResult ? nextResult.blocks : [];
      setResult(nextResult);
      setLatex(nextResult.latex);
      setDocumentEdited(false);
      setDocumentBlocks(blocks);
      setSavedEdits(false);
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        mode,
        files: [...files],
        crop,
        result: nextResult,
        latex: nextResult.latex,
        blocks,
        documentEdited: false,
      };
      setActiveEntry(entry);
      void onStore(entry);
    }
  }, [receivedResult]);

  const isSubmitting = fetcher.state !== "idle" || job.busy;
  const error =
    fetcher.data && !fetcher.data.success ? fetcher.data.error : null;
  const warnings = result?.warnings ?? [];

  async function copyLatex() {
    try {
      await navigator.clipboard.writeText(latex);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(true);
    }
  }

  function downloadLatex() {
    const url = URL.createObjectURL(
      new Blob(
        [mode === "document" ? latex : assembleLatexDocument(outputBlocks, 1)],
        { type: "text/x-tex" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "snaptex-document.tex";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function updateDocumentBlocks(next: DocumentBlock[]) {
    if (!result || !("pageCount" in result)) return;
    setSavedEdits(false);
    setDocumentBlocks(next);
    setLatex(assembleLatexDocument(next, result.pageCount));
    setDocumentEdited(false);
  }

  function downloadProject() {
    try {
      const bytes = createDocumentArchive(latex, documentBlocks);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/zip" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "snaptex-overleaf-project.zip";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportError("");
    } catch {
      setExportError("Could not export the project. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ede9fe,_transparent_35%),linear-gradient(#f8fafc,#eef2ff)] px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">
            SnapTEX
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Turn handwritten mathematics into editable LaTeX.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            Convert one equation or assemble several photographed pages into an
            editable, copyable, Overleaf-ready document.
          </p>
        </header>

        <ConversionHistory {...history} disabled={isSubmitting} />

        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-2xl border border-white/80 bg-white/85 p-6 shadow-xl shadow-indigo-100/60 backdrop-blur">
            <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              {(["equation", "document"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    if (option !== mode) setMode(option);
                  }}
                  disabled={isSubmitting}
                  aria-pressed={mode === option}
                  className={`rounded-lg px-3 py-2 capitalize ${mode === option ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}
                >
                  {option}
                </button>
              ))}
            </div>
            <h2 className="mt-5 text-lg font-semibold text-slate-900">
              {mode === "equation" ? "Equation image" : "Document pages"}
            </h2>

            <fetcher.Form
              onSubmit={(event) => {
                event.preventDefault();
                if (!files.length || fileError || isSubmitting) return;
                if (mode === "document") setDocumentFiles([...files]);
                const data = new FormData();
                for (const file of files)
                  data.append(mode === "equation" ? "image" : "images", file);
                if (
                  mode === "equation" &&
                  crop &&
                  crop.width >= 0.01 &&
                  crop.height >= 0.01
                )
                  data.set("crop", JSON.stringify(crop));
                fetcher.submit(data, {
                  method: "post",
                  action:
                    mode === "equation"
                      ? "/api/convert"
                      : "/api/convert-document",
                  encType: "multipart/form-data",
                });
              }}
              method="post"
              action={
                mode === "equation" ? "/api/convert" : "/api/convert-document"
              }
              encType="multipart/form-data"
              className="mt-5"
            >
              <UploadSelection
                isSubmitting={isSubmitting}
                mode={mode}
                files={files}
                imageUrl={imageUrl}
                crop={crop}
                setFiles={setFiles}
                setCrop={setCrop}
                setFileError={setFileError}
                onReset={onReset}
              />

              {(fileError || error || job.error) && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
                >
                  {fileError || job.error || error?.message}
                </p>
              )}

              {job.busy && (
                <div
                  role="status"
                  className="mt-4 rounded-lg bg-violet-50 p-3 text-sm text-violet-900"
                >
                  Document {job.progress?.status ?? "queued"}:{" "}
                  {job.progress?.completedPages ?? 0}/
                  {job.progress?.totalPages ?? files.length} pages finished.
                  <button
                    type="button"
                    onClick={() => void job.cancel()}
                    className="ml-3 font-semibold underline"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {job.pollWarning && (
                <p role="status" className="mt-2 text-sm text-amber-800">
                  {job.pollWarning}
                </p>
              )}
              {warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {warnings.map((warning, index) => (
                    <p
                      key={`${warning.code}-${index}`}
                      className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
                    >
                      {warning.message}
                      {warning.crop &&
                        warning.page &&
                        documentFiles[warning.page - 1] && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            className="ml-2 font-semibold underline"
                            onClick={() =>
                              onRetryRegion(
                                documentFiles[warning.page! - 1],
                                warning.crop!,
                              )
                            }
                          >
                            Retry this crop in equation mode
                          </button>
                        )}
                    </p>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  files.length === 0 || Boolean(fileError) || isSubmitting
                }
                className="mt-5 w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting
                  ? "Converting…"
                  : mode === "equation"
                    ? "Convert to LaTeX"
                    : "Assemble LaTeX document"}
              </button>
            </fetcher.Form>
          </section>

          <section className="rounded-2xl border border-white/80 bg-white/85 p-6 shadow-xl shadow-indigo-100/60 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {mode === "equation" ? "LaTeX result" : "LaTeX document"}
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {result?.provider ?? "Waiting"}
              </span>
            </div>

            {mode === "document" &&
              result &&
              !isSubmitting &&
              (documentEdited ? (
                <p className="mt-4 text-sm text-slate-600">
                  To add or remove blocks,{" "}
                  <button
                    type="button"
                    className="font-semibold text-violet-700"
                    onClick={() => updateDocumentBlocks(documentBlocks)}
                  >
                    replace your source edits with the structured document
                  </button>
                  .
                </p>
              ) : (
                <DocumentFigureEditor
                  key={String(result.latex)}
                  files={documentFiles}
                  blocks={documentBlocks}
                  onChange={updateDocumentBlocks}
                />
              ))}
            {exportError && (
              <p role="alert" className="mt-3 text-sm text-rose-700">
                {exportError}
              </p>
            )}

            <details className="mt-5">
              <summary className="cursor-pointer text-sm font-semibold text-violet-700">
                LaTeX source and corrections
              </summary>
              <label
                className="mt-3 block text-sm font-medium text-slate-700"
                htmlFor="latex"
              >
                Editable source
              </label>
              <textarea
                id="latex"
                value={latex}
                onChange={(event) => {
                  setSavedEdits(false);
                  setLatex(event.target.value);
                  if (mode === "document") setDocumentEdited(true);
                }}
                placeholder={
                  mode === "equation"
                    ? String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`
                    : String.raw`\documentclass{article}`
                }
                className="mt-2 min-h-56 w-full resize-y rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm leading-6 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              />

              {activeEntry && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      const updated = {
                        ...activeEntry,
                        latex,
                        blocks: documentBlocks,
                        documentEdited,
                      };
                      setActiveEntry(updated);
                      void onStore(updated).then(() => setSavedEdits(true));
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50"
                  >
                    Save edits to history
                  </button>
                  {savedEdits && (
                    <span role="status" className="text-sm text-slate-600">
                      History updated. Check history above for any storage
                      errors.
                    </span>
                  )}
                  {latex !== activeEntry.result.latex && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setLatex(activeEntry.result.latex);
                        setDocumentBlocks(
                          "blocks" in activeEntry.result
                            ? activeEntry.result.blocks
                            : [],
                        );
                        setDocumentEdited(false);
                        setSavedEdits(false);
                      }}
                      className="text-sm font-semibold text-slate-600"
                    >
                      Restore generated LaTeX
                    </button>
                  )}
                </div>
              )}
            </details>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-slate-700">
                Document preview
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportPdf}
                  disabled={
                    !outputBlocks.length ||
                    isSubmitting ||
                    preparingPdf ||
                    (mode === "document" && documentEdited)
                  }
                  className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {preparingPdf ? "Preparing PDF…" : "Save PDF"}
                </button>
                {
                  <button
                    type="button"
                    disabled={!latex}
                    onClick={downloadLatex}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-violet-400 disabled:opacity-50"
                  >
                    Download .tex
                  </button>
                }
                {mode === "document" && (
                  <button
                    type="button"
                    disabled={!latex || isSubmitting}
                    onClick={downloadProject}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Download project ZIP
                  </button>
                )}
                <button
                  type="button"
                  disabled={!latex}
                  onClick={copyLatex}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-400 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copied
                    ? "Copied"
                    : mode === "document"
                      ? "Copy document"
                      : "Copy LaTeX"}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Save PDF opens the print dialog. Choose Save as PDF and turn off
              browser headers and footers for a clean document.
            </p>
            {mode === "document" && documentEdited && (
              <p className="mt-2 text-sm text-amber-800">
                This preview shows the document blocks. To compile your freeform
                source edits, download the project ZIP and open it in Overleaf.
                PDF export is paused until the blocks and source match.
              </p>
            )}
            <style>{documentStyles}</style>
            <div className="mt-3 max-h-[42rem] overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
              {outputBlocks.length ? (
                <PaperDocument blocks={outputBlocks} />
              ) : (
                <p className="p-8 text-center text-sm text-slate-500">
                  Your typeset document will appear here after conversion.
                </p>
              )}
            </div>
            {mode === "document" && documentBlocks.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-violet-700">
                  Manage document blocks
                </summary>
                <DocumentPreview
                  blocks={documentBlocks}
                  onRemove={
                    documentEdited || isSubmitting
                      ? undefined
                      : (id) =>
                          updateDocumentBlocks(
                            documentBlocks.filter((block) => block.id !== id),
                          )
                  }
                />
              </details>
            )}
            {copyError && (
              <p role="alert" className="mt-3 text-sm text-rose-700">
                Clipboard access failed. Select and copy the source above.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
