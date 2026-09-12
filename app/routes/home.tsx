import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { LatexPreview } from "~/components/latex-preview";
import { ImageCropSelector } from "~/components/image-crop-selector";
import type { ConvertResponse, EquationCrop } from "~/recognition/types";

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
  const fetcher = useFetcher<ConvertResponse>();
  const [file, setFile] = useState<File | null>(null);
  const [latex, setLatex] = useState("");
  const [copied, setCopied] = useState(false);
  const [crop, setCrop] = useState<EquationCrop>();

  const imageUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (fetcher.data?.success) {
      setLatex(fetcher.data.result.latex);
    }
  }, [fetcher.data]);

  const isSubmitting = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.success ? fetcher.data.error : null;

  async function copyLatex() {
    await navigator.clipboard.writeText(latex);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ede9fe,_transparent_35%),linear-gradient(#f8fafc,#eef2ff)] px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">
            SnapTEX
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Turn equation images into editable LaTeX.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            Upload a PNG, JPEG, or WebP equation image. SnapTEX locates the
            equation automatically, or you can drag to select it yourself.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-2xl border border-white/80 bg-white/85 p-6 shadow-xl shadow-indigo-100/60 backdrop-blur">
            <h2 className="text-lg font-semibold text-slate-900">Equation image</h2>

            <fetcher.Form
              method="post"
              action="/api/convert"
              encType="multipart/form-data"
              className="mt-5"
            >
              <input
                id="equation-image"
                className="sr-only"
                type="file"
                name="image"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setCrop(undefined);
                }}
              />
              <div className="min-h-64 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                {imageUrl ? (
                  <ImageCropSelector
                    imageUrl={imageUrl}
                    crop={crop}
                    onCropChange={setCrop}
                  />
                ) : (
                  <label htmlFor="equation-image" className="flex min-h-52 cursor-pointer flex-col items-center justify-center">
                    <>
                      <span className="rounded-full bg-violet-100 px-4 py-2 text-sm font-semibold text-violet-700">
                        Choose an image
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
              {crop && crop.width >= 0.01 && crop.height >= 0.01 && (
                <input type="hidden" name="crop" value={JSON.stringify(crop)} />
              )}

              {error && (
                <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {error.message}
                </p>
              )}

              <button
                type="submit"
                disabled={!file || isSubmitting}
                className="mt-5 w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Converting…" : "Convert to LaTeX"}
              </button>
            </fetcher.Form>
          </section>

          <section className="rounded-2xl border border-white/80 bg-white/85 p-6 shadow-xl shadow-indigo-100/60 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">LaTeX result</h2>
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
              onChange={(event) => setLatex(event.target.value)}
              placeholder={String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`}
              className="mt-2 min-h-36 w-full resize-y rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm leading-6 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />

            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">Live preview</h3>
              <button
                type="button"
                disabled={!latex}
                onClick={copyLatex}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-400 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied ? "Copied" : "Copy LaTeX"}
              </button>
            </div>
            <div className="mt-2">
              <LatexPreview latex={latex} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
