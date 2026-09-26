import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { LatexPreview } from "~/components/latex-preview";
import { ImageCropSelector } from "~/components/image-crop-selector";
import { DocumentPreview } from "~/components/document-preview";
import type {
  ConvertDocumentResponse,
  ConvertResponse,
  DocumentBlock,
  EquationCrop,
} from "~/recognition/types";

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
  return <HomeWorkflow key={mode} mode={mode} setMode={setMode} />;
}

function HomeWorkflow({
  mode,
  setMode,
}: {
  mode: "equation" | "document";
  setMode: (mode: "equation" | "document") => void;
}) {
  const fetcher = useFetcher<ConvertResponse | ConvertDocumentResponse>();
  const [files, setFiles] = useState<File[]>([]);
  const [latex, setLatex] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [crop, setCrop] = useState<EquationCrop>();
  const [fileError, setFileError] = useState("");
  const [documentEdited, setDocumentEdited] = useState(false);

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
    if (fetcher.data?.success) {
      setLatex(fetcher.data.result.latex);
      setDocumentEdited(false);
    }
  }, [fetcher.data]);

  const isSubmitting = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.success ? fetcher.data.error : null;
  const warnings = fetcher.data?.success ? fetcher.data.result.warnings : [];

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
    const url = URL.createObjectURL(new Blob([latex], { type: "text/x-tex" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "snaptex-document.tex";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const documentBlocks: DocumentBlock[] =
    fetcher.data?.success && "blocks" in fetcher.data.result
      ? fetcher.data.result.blocks
      : [];

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
              method="post"
              action={mode === "equation" ? "/api/convert" : "/api/convert-document"}
              encType="multipart/form-data"
              className="mt-5"
            >
              <input
                id="equation-image"
                className="sr-only"
                type="file"
                name={mode === "equation" ? "image" : "images"}
                multiple={mode === "document"}
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  const invalid = selected.find((file) =>
                    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
                    file.size === 0 || file.size > 8 * 1024 * 1024,
                  );
                  const message = selected.length > 20 && mode === "document"
                    ? "Choose no more than 20 pages."
                    : invalid
                      ? `Check ${invalid.name}: pages must be nonempty PNG, JPEG, or WebP images under 8 MB.`
                      : "";
                  setFileError(message);
                  setFiles(selected);
                  setCrop(undefined);
                }}
              />
              <div className="min-h-64 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                {imageUrl ? (
                  mode === "equation" ? (
                    <ImageCropSelector
                      imageUrl={imageUrl}
                      crop={crop}
                      onCropChange={setCrop}
                    />
                  ) : (
                    <div className="flex min-h-52 flex-col items-center justify-center">
                      <img src={imageUrl} alt="First selected page" className="max-h-64 rounded-lg object-contain" />
                      <p className="mt-3 text-sm font-medium text-slate-600">
                        {files.length} page{files.length === 1 ? "" : "s"} selected
                      </p>
                    </div>
                  )
                ) : (
                  <label htmlFor="equation-image" className="flex min-h-52 cursor-pointer flex-col items-center justify-center">
                    <>
                      <span className="rounded-full bg-violet-100 px-4 py-2 text-sm font-semibold text-violet-700">
                        {mode === "equation" ? "Choose an image" : "Choose page images"}
                    </span>
                    <span className="mt-3 text-sm text-slate-500">
                        PNG, JPEG, or WebP · maximum 8 MB
                      </span>
                    </>
                  </label>
                )}
              </div>

              {imageUrl && (
                <label htmlFor="equation-image" className="mt-3 inline-flex cursor-pointer text-sm font-semibold text-violet-700 hover:text-violet-900">
                  Choose a different image
                </label>
              )}
              {mode === "document" && files.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-slate-600">Pages will be converted in this order:</p>
                  <ol className="mt-2 max-h-32 list-decimal space-y-1 overflow-y-auto pl-6 text-sm text-slate-700">
                    {files.map((file, index) => <li key={`${file.name}-${index}`} className="truncate">{file.name}</li>)}
                  </ol>
                  <p className="mt-2 text-xs text-slate-500">To change the order, choose the pages again in the desired order.</p>
                </div>
              )}
              {mode === "equation" && crop && crop.width >= 0.01 && crop.height >= 0.01 && (
                <input type="hidden" name="crop" value={JSON.stringify(crop)} />
              )}

              {(fileError || error) && (
                <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {fileError || error?.message}
                </p>
              )}

              {warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {warnings.map((warning, index) => (
                    <p key={`${warning.code}-${index}`} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      {warning.message}
                    </p>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={files.length === 0 || Boolean(fileError) || isSubmitting}
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
                {fetcher.data?.success ? fetcher.data.result.provider : "Waiting"}
              </span>
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="latex">
              Editable source
            </label>
            <textarea
              id="latex"
              value={latex}
              onChange={(event) => {
                setLatex(event.target.value);
                if (mode === "document") setDocumentEdited(true);
              }}
              placeholder={mode === "equation" ? String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}` : String.raw`\documentclass{article}`}
              className="mt-2 min-h-56 w-full resize-y rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm leading-6 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />

            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">Live preview</h3>
              <div className="flex gap-2">
                {mode === "document" && (
                  <button type="button" disabled={!latex} onClick={downloadLatex} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-violet-400 disabled:opacity-50">
                    Download .tex
                  </button>
                )}
                <button
                  type="button"
                  disabled={!latex}
                  onClick={copyLatex}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-400 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copied ? "Copied" : mode === "document" ? "Copy document" : "Copy LaTeX"}
                </button>
              </div>
            </div>
            <div className="mt-2">
              {mode === "document" ? (
                <>
                  <p className="mb-2 text-xs text-slate-500">
                    {documentEdited
                      ? "This preview shows the original recognized blocks. Copy or download uses your edited source."
                      : "Structured preview of the recognized blocks. Copy or download uses the source above."}
                  </p>
                  <DocumentPreview blocks={documentBlocks} />
                </>
              ) : (
                <LatexPreview latex={latex} />
              )}
            </div>
            {copyError && <p role="alert" className="mt-3 text-sm text-rose-700">Clipboard access failed. Select and copy the source above.</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
