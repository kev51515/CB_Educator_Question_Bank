import { useCallback, useEffect, useRef, useState } from "react";

interface InlineRenameProps {
  value: string;
  disabled: boolean;
  onSave: (next: string) => Promise<void>;
  className?: string;
  titleClassName?: string;
}

/**
 * Click-to-edit text field. Enter / blur save, Esc cancels. Empty values
 * collapse back to the original value to avoid accidental clears.
 */
function InlineRename({
  value,
  disabled,
  onSave,
  className,
  titleClassName,
}: InlineRenameProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(async (): Promise<void> => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === value) {
      setDraft(value);
      return;
    }
    await onSave(trimmed);
  }, [draft, onSave, value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={() => {
          void commit();
        }}
        className={`bg-white dark:bg-slate-800 ring-1 ring-indigo-400 rounded-md px-2 py-0.5 text-sm w-full max-w-md ${
          className ?? ""
        }`}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        setEditing(true);
      }}
      className={`group inline-flex items-center gap-1 min-w-0 text-left ${
        disabled ? "cursor-default" : "cursor-text"
      } ${className ?? ""}`}
    >
      <span className={`truncate ${titleClassName ?? ""}`}>{value}</span>
      {!disabled && (
        <svg
          width={12}
          height={12}
          viewBox="0 0 16 16"
          aria-hidden
          className="opacity-60 group-hover:opacity-100 transition text-slate-400 flex-none"
        >
          <path
            fill="currentColor"
            d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-1.66 1.66l-3.56-3.56l1.66-1.66Zm-2.6 2.6L2.158 10.28a1.75 1.75 0 0 0-.479.864l-.7 2.91a.75.75 0 0 0 .907.907l2.91-.7a1.75 1.75 0 0 0 .864-.479l6.254-6.254l-3.56-3.56Z"
          />
        </svg>
      )}
    </button>
  );
}

export { InlineRename };
export type { InlineRenameProps };
