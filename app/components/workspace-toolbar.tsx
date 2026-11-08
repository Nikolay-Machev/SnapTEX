import type { ReactNode } from "react";

export function WorkspaceToolbar({
  title,
  onTitleChange,
  status,
  disabled,
  saving,
  onSave,
  children,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  status: string;
  disabled: boolean;
  saving: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <header className="workspace-toolbar">
      <a className="workspace-brand" href="/" aria-label="SnapTEX home">
        <span className="brand-mark">
          S<span>ₜ</span>
        </span>
        <span>
          Snap<span className="brand-tex">TEX</span>
        </span>
      </a>
      <div className="workspace-title-group">
        <label className="sr-only" htmlFor="document-title">
          Document title
        </label>
        <input
          id="document-title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={disabled}
          maxLength={160}
          placeholder="Untitled document"
        />
        <span role="status" className="workspace-save-status">
          {status}
        </span>
      </div>
      <div className="workspace-toolbar-actions">
        <button
          type="button"
          className="workspace-save-button"
          disabled={disabled || saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {children}
      </div>
    </header>
  );
}
