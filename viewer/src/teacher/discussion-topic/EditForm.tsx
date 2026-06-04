/**
 * discussion-topic/EditForm
 * =========================
 * Inline post-body editor (MarkdownEditor + save/cancel). Extracted verbatim
 * from DiscussionTopicView.
 */
import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { getErrorMessage, MAX_POST_LEN } from "./helpers";
export interface EditFormProps {
  /** Initial body HTML to seed the editor with. */
  initialBody: string;
  /** Save handler — resolves true on success so the form can collapse. */
  onSave: (body: string) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * Inline body editor for an existing post. Esc cancels, Cmd/Ctrl+Enter saves.
 * Mirrors ReplyForm's snapshot/restore-on-failure pattern so a failed save
 * never loses the typed value.
 */
export function EditForm({ initialBody, onSave, onCancel }: EditFormProps) {
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keyboard shortcuts: Esc cancels, Cmd/Ctrl+Enter saves. Bound on the
  // container so the editor (TipTap) still owns intra-text Enter.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void submit();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel, body]);

  const submit = async (): Promise<void> => {
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Post body cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_POST_LEN) {
      setError(`Post must be ${MAX_POST_LEN} characters or fewer.`);
      return;
    }
    setBusy(true);
    try {
      const ok = await onSave(trimmed);
      if (!ok) {
        // Keep the form open with the typed value so the user can retry.
        return;
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to save edit."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
        >
          {error}
        </div>
      )}
      <MarkdownEditor
        value={body}
        onChange={setBody}
        placeholder="Edit your post…"
        minHeight={80}
        characterLimit={MAX_POST_LEN}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 min-h-[40px]"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[40px]"
        >
          Cancel
        </button>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto hidden sm:inline">
          Esc to cancel · ⌘/Ctrl+Enter to save
        </span>
      </div>
    </div>
  );
}
