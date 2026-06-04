/**
 * course-discussions/InlineRenameTitle
 * ====================================
 * Click-to-rename discussion topic title (pencil-on-hover, Enter/Esc).
 * Extracted verbatim from CourseDiscussions.
 */
import { useCallback, useEffect, useRef, useState } from "react";
export interface InlineRenameTitleProps {
  value: string;
  disabled: boolean;
  onSave: (next: string) => Promise<void>;
}

/**
 * Click-to-edit topic title. Enter / blur save, Esc cancels. Empty values
 * collapse back to the original to avoid accidental clears. Mirrors the
 * DiscussionTopicView InlineRenameTitle pattern but scaled to the list-row
 * heading. Throws from onSave keep the editor open with the user's typed
 * value so they can retry instead of losing it.
 */
export function InlineRenameTitle({
  value,
  disabled,
  onSave,
}: InlineRenameTitleProps): JSX.Element {
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
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      // Keep editing=true; parent handler toasted. User keeps their draft.
    }
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
        onClick={(e) => {
          // Prevent the wrapping <Link> from navigating while editing.
          e.preventDefault();
          e.stopPropagation();
        }}
        onBlur={() => {
          void commit();
        }}
        className="bg-white dark:bg-slate-800 ring-1 ring-indigo-400 rounded-md px-2 py-0.5 text-base font-semibold text-slate-900 dark:text-slate-100 w-full max-w-md"
        aria-label="Topic title"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        setEditing(true);
      }}
      className={`group inline-flex items-center gap-1 min-w-0 text-left ${
        disabled ? "cursor-default" : "cursor-text"
      }`}
      title={disabled ? undefined : "Click to rename"}
    >
      <span className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
        {value}
      </span>
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
