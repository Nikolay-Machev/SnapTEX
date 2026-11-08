import { useEffect, useMemo, useState } from "react";

export function SourcePages({
  files,
  disabled,
}: {
  files: File[];
  disabled: boolean;
}) {
  const [page, setPage] = useState(0);
  const index = Math.min(page, Math.max(0, files.length - 1));
  const file = files[index];
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <div className="source-pages">
      <div className="source-page-navigation">
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={() => setPage(index - 1)}
          aria-label="Previous source page"
        >
          ←
        </button>
        <span>
          Page {index + 1} of {files.length}
        </span>
        <button
          type="button"
          disabled={disabled || index >= files.length - 1}
          onClick={() => setPage(index + 1)}
          aria-label="Next source page"
        >
          →
        </button>
      </div>
      {url && (
        <img
          src={url}
          alt={`Source page ${index + 1}: ${file.name}`}
          className="max-h-96 w-full rounded-lg object-contain"
        />
      )}
      <p className="mt-3 truncate text-xs text-slate-500">{file?.name}</p>
    </div>
  );
}
