import type { EquationCrop } from "~/recognition/types";
import { ImageCropSelector } from "./image-crop-selector";

export function UploadSelection({
  isSubmitting,
  mode,
  files,
  imageUrl,
  crop,
  setFiles,
  setCrop,
  setFileError,
  onReset,
}: {
  isSubmitting: boolean;
  mode: "equation" | "document";
  files: File[];
  imageUrl: string | null;
  crop?: EquationCrop;
  setFiles: (files: File[]) => void;
  setCrop: (crop?: EquationCrop) => void;
  setFileError: (error: string) => void;
  onReset: () => void;
}) {
  return (
    <>
      <input
        disabled={isSubmitting}
        id="equation-image"
        className="sr-only"
        type="file"
        name={mode === "equation" ? "image" : "images"}
        multiple={mode === "document"}
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          const invalid = selected.find(
            (file) =>
              !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
              file.size === 0 ||
              file.size > 8 * 1024 * 1024,
          );
          const message =
            selected.length > 20 && mode === "document"
              ? "Choose no more than 20 pages."
              : invalid
                ? invalid.size === 0
                  ? `${invalid.name} is empty. Choose a different file.`
                  : invalid.size > 8 * 1024 * 1024
                    ? `${invalid.name} is ${(invalid.size / (1024 * 1024)).toFixed(1)} MB. The limit is 8 MB per image. Export a smaller JPEG or reduce the image dimensions, then upload it again.`
                    : `${invalid.name} has an unsupported file type (${invalid.type || "unknown"}). Export it as PNG, JPEG, or WebP, then upload it again.`
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
              <img
                src={imageUrl}
                alt="First selected page"
                className="max-h-64 rounded-lg object-contain"
              />
              <p className="mt-3 text-sm font-medium text-slate-600">
                {files.length} page{files.length === 1 ? "" : "s"} selected
              </p>
            </div>
          )
        ) : (
          <label
            htmlFor="equation-image"
            className="flex min-h-52 cursor-pointer flex-col items-center justify-center"
          >
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label
            htmlFor="equation-image"
            className="inline-flex cursor-pointer text-sm font-semibold text-violet-700 hover:text-violet-900"
          >
            Choose a different image
          </label>
          <button
            type="button"
            onClick={onReset}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-rose-400 hover:text-rose-700 disabled:opacity-50"
          >
            {mode === "document" ? "Remove selected images" : "Remove image"}
          </button>
        </div>
      )}
      {mode === "document" && files.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-600">
            Pages will be converted in this order:
          </p>
          <ol className="mt-2 max-h-32 list-decimal space-y-1 overflow-y-auto pl-6 text-sm text-slate-700">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="truncate">
                {file.name}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-slate-500">
            To change the order, choose the pages again in the desired order.
          </p>
        </div>
      )}
      {mode === "equation" &&
        crop &&
        crop.width >= 0.01 &&
        crop.height >= 0.01 && (
          <input type="hidden" name="crop" value={JSON.stringify(crop)} />
        )}
    </>
  );
}
