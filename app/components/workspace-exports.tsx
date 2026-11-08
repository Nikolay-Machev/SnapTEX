export function WorkspaceExports({
  pdfDisabled,
  textDisabled,
  zipDisabled,
  preparingPdf,
  copied,
  isDocument,
  onPdf,
  onTex,
  onZip,
  onCopy,
}: {
  pdfDisabled: boolean;
  textDisabled: boolean;
  zipDisabled: boolean;
  preparingPdf: boolean;
  copied: boolean;
  isDocument: boolean;
  onPdf: () => void;
  onTex: () => void;
  onZip: () => void;
  onCopy: () => void;
}) {
  const actions = [
    {
      id: "pdf",
      label: preparingPdf ? "Preparing PDF…" : "Save PDF",
      disabled: pdfDisabled,
      action: onPdf,
    },
    {
      id: "tex",
      label: "Download .tex",
      disabled: textDisabled,
      action: onTex,
    },
    {
      id: "zip",
      label: "Download project ZIP",
      disabled: zipDisabled,
      action: onZip,
    },
    {
      id: "copy",
      label: copied ? "Copied" : isDocument ? "Copy document" : "Copy LaTeX",
      disabled: textDisabled,
      action: onCopy,
    },
  ];
  return (
    <div className="workspace-export-actions">
      {actions.map((item) => (
        <button
          key={item.id}
          type="button"
          className="toolbar-export"
          disabled={item.disabled}
          onClick={item.action}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
