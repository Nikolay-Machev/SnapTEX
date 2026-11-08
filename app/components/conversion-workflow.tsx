import { useEffect, useMemo, useState, useRef } from "react";
import { useFetcher } from "react-router";

import { ConversionHistory } from "~/components/conversion-history";
import type { HistoryEntry } from "~/utils/conversion-history";
import { WorkspaceExports } from "./workspace-exports";
import { WorkspaceSource } from "./workspace-source";
import { WorkspaceToolbar } from "./workspace-toolbar";
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
  onStore: (entry: HistoryEntry) => Promise<boolean>;
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
  const editVersion = useRef(0);
  function markDirty() {
    editVersion.current += 1;
    setSavedEdits(false);
  }
  function leaveWorkspace(action: () => void) {
    if (
      savedEdits ||
      (!latex.trim() && !files.length && title === "Untitled document") ||
      window.confirm(
        "Discard unsaved changes? Save your document first to keep them.",
      )
    )
      action();
  }
  const [title, setTitle] = useState(
    initial?.title ??
      initial?.files[0]?.name.replace(/\.[^.]+$/, "") ??
      "Untitled document",
  );
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>(initial?.files ?? []);
  const [latex, setLatex] = useState(initial?.latex ?? "");
  const [activeEntry, setActiveEntry] = useState<HistoryEntry | undefined>(
    initial,
  );
  const [result, setResult] = useState<HistoryEntry["result"] | undefined>(
    initial?.result,
  );
  const [savedEdits, setSavedEdits] = useState(Boolean(initial));
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
      const nextTitle =
        title === "Untitled document" && files[0]
          ? files[0].name.replace(/\.[^.]+$/, "")
          : title;
      setTitle(nextTitle);
      const blocks = "blocks" in nextResult ? nextResult.blocks : [];
      setResult(nextResult);
      setLatex(nextResult.latex);
      setDocumentEdited(false);
      setDocumentBlocks(blocks);
      setSavedEdits(false);
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        title: nextTitle,
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
      const version = editVersion.current;
      void onStore(entry).then((saved) => {
        if (version === editVersion.current) setSavedEdits(saved);
      });
    }
  }, [receivedResult]);

  const isSubmitting = fetcher.state !== "idle" || job.busy;
  useEffect(() => {
    if (
      savedEdits ||
      (!latex.trim() && !files.length && title === "Untitled document")
    )
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [savedEdits, latex, title, files.length]);
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
    anchor.download = `${downloadName}.tex`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function updateDocumentBlocks(next: DocumentBlock[]) {
    if (!result || !("pageCount" in result)) return;
    markDirty();
    setDocumentBlocks(next);
    setLatex(assembleLatexDocument(next, result.pageCount));
    setDocumentEdited(false);
  }

  function downloadProject() {
    try {
      const bytes = createDocumentArchive(
        mode === "document" ? latex : assembleLatexDocument(outputBlocks, 1),
        outputBlocks,
      );
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/zip" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${downloadName}.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportError("");
    } catch {
      setExportError("Could not export the project. Please try again.");
    }
  }

  const downloadName =
    title
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "snaptex-document";
  async function saveEdits() {
    if (saving || isSubmitting) return;
    setSaving(true);
    const version = editVersion.current;
    const entry: HistoryEntry = {
      id: activeEntry?.id ?? crypto.randomUUID(),
      createdAt: activeEntry?.createdAt ?? new Date().toISOString(),
      title: title.trim() || "Untitled document",
      mode,
      files: [...files],
      crop,
      result:
        result ??
        (mode === "document"
          ? {
              latex: "",
              blocks: [],
              warnings: [],
              provider: "Draft",
              pageCount: Math.max(1, files.length),
            }
          : { latex: "", confidence: null, warnings: [], provider: "Draft" }),
      latex,
      blocks: documentBlocks,
      documentEdited,
    };
    try {
      setActiveEntry(entry);
      if (!result) {
        setResult(entry.result);
        if (mode === "document") setDocumentFiles([...files]);
      }
      const saved = await onStore(entry);
      if (version === editVersion.current) setSavedEdits(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="document-workspace">
      <h1 className="sr-only">SnapTEX document workspace</h1>
      <WorkspaceToolbar
        title={title}
        onTitleChange={(value) => {
          setTitle(value);
          markDirty();
        }}
        disabled={isSubmitting}
        saving={saving}
        onSave={() => void saveEdits()}
        status={
          history.error
            ? "Storage unavailable · download a copy"
            : saving
              ? "Saving…"
              : savedEdits
                ? "Saved in this browser"
                : "Unsaved changes"
        }
      >
        <WorkspaceExports
          pdfDisabled={
            !outputBlocks.length ||
            isSubmitting ||
            preparingPdf ||
            (mode === "document" && documentEdited)
          }
          textDisabled={!latex}
          zipDisabled={!latex || isSubmitting}
          preparingPdf={preparingPdf}
          copied={copied}
          isDocument={mode === "document"}
          onPdf={() => void exportPdf()}
          onTex={downloadLatex}
          onZip={downloadProject}
          onCopy={() => void copyLatex()}
        />
      </WorkspaceToolbar>
      <div className="workspace-body">
        <aside className="workspace-sidebar">
          <button
            type="button"
            className="new-document-button"
            disabled={isSubmitting}
            onClick={() => leaveWorkspace(onReset)}
          >
            <span aria-hidden="true">+</span> New document
          </button>
          <ConversionHistory
            {...history}
            onOpen={(entry) => leaveWorkspace(() => history.onOpen(entry))}
            onDelete={(id) => {
              history.onDelete(id);
              if (id === activeEntry?.id) markDirty();
            }}
            onClear={() => {
              history.onClear();
              markDirty();
            }}
            activeId={activeEntry?.id}
            disabled={isSubmitting}
          />
          <p className="workspace-sidebar-note">
            Your work stays on this device.
            <br />
            Review generated mathematics before sharing.
          </p>
        </aside>
        <div className="workspace-panels">
          <section
            className="workspace-panel source-panel"
            aria-label="Source image and crops"
          >
            <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              {(["equation", "document"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    if (option !== mode) leaveWorkspace(() => setMode(option));
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
                setFiles={(next) => {
                  setFiles(next);
                  markDirty();
                }}
                setCrop={(next) => {
                  setCrop(next);
                  markDirty();
                }}
                setFileError={setFileError}
                onReset={() => {
                  setFiles([]);
                  setDocumentFiles([]);
                  setCrop(undefined);
                  setFileError("");
                  markDirty();
                }}
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
          </section>

          <section
            className="workspace-panel editor-panel"
            aria-label="LaTeX editor and preview"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {mode === "equation" ? "LaTeX result" : "LaTeX document"}
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {result?.provider ?? "Waiting"}
              </span>
            </div>

            {exportError && (
              <p role="alert" className="mt-3 text-sm text-rose-700">
                {exportError}
              </p>
            )}

            <WorkspaceSource
              latex={latex}
              isDocument={mode === "document"}
              disabled={isSubmitting}
              onChange={(value) => {
                markDirty();
                setLatex(value);
                if (mode === "document") setDocumentEdited(true);
              }}
              onRestore={
                activeEntry && latex !== activeEntry.result.latex
                  ? () => {
                      setLatex(activeEntry.result.latex);
                      setDocumentBlocks(
                        "blocks" in activeEntry.result
                          ? activeEntry.result.blocks
                          : [],
                      );
                      setDocumentEdited(false);
                      markDirty();
                    }
                  : undefined
              }
            />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-slate-700">
                Document preview
              </h3>
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
            <div className="workspace-paper-preview">
              {outputBlocks.length ? (
                <PaperDocument blocks={outputBlocks} />
              ) : (
                <div className="empty-document-sheet">
                  <span className="empty-sheet-label">DOCUMENT PREVIEW</span>
                  <h3>Your next idea starts here.</h3>
                  <p>
                    Upload handwritten mathematics or write LaTeX in the editor
                    to begin.
                  </p>
                  <div className="empty-sheet-lines" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
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
