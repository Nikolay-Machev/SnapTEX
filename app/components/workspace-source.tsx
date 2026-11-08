export function WorkspaceSource({
  latex,
  isDocument,
  disabled,
  onChange,
  onRestore,
}: {
  latex: string;
  isDocument: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onRestore?: () => void;
}) {
  return (
    <div className="source-editor">
      <label
        className="mt-3 block text-sm font-medium text-slate-700"
        htmlFor="latex"
      >
        Editable source
      </label>
      <textarea
        id="latex"
        value={latex}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          isDocument
            ? String.raw`\documentclass{article}`
            : String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`
        }
        className="latex-editor"
        spellCheck={false}
        disabled={disabled}
      />
      {onRestore && (
        <button
          type="button"
          disabled={disabled}
          onClick={onRestore}
          className="mt-3 text-sm font-semibold text-slate-600"
        >
          Restore generated LaTeX
        </button>
      )}
    </div>
  );
}
