/**
 * discussion-topic/ReplyForm
 * ==========================
 * Inline reply composer (MarkdownEditor + submit). Extracted verbatim from
 * DiscussionTopicView.
 */
import { useState } from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { getErrorMessage, MAX_POST_LEN } from "./helpers";
export interface ReplyFormProps {
  /** Body submission handled by the parent so it can stage an optimistic append, fire the insert, and reconcile/rollback. Resolves true on success. */
  onSubmitReply: (body: string) => Promise<boolean>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocusKey?: number;
}

export function ReplyForm({
  onSubmitReply,
  onCancel,
  placeholder,
  autoFocusKey,
}: ReplyFormProps) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bump `autoFocusKey` from the parent to force a remount when the user
  // clicks "Be the first to reply" — TipTap doesn't expose an imperative
  // focus handle here, so remounting is the lightest-touch fix.
  const _focusBump = autoFocusKey;
  void _focusBump;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Please enter a reply.");
      return;
    }
    if (trimmed.length > MAX_POST_LEN) {
      setError(`Reply must be ${MAX_POST_LEN} characters or fewer.`);
      return;
    }
    // Snapshot the typed draft BEFORE attempting the insert. If the insert
    // fails for any reason (RLS, network, or a thrown exception) we restore
    // the editor to this snapshot so the user doesn't lose what they wrote.
    // Mirrors ThreadView.tsx:149 / SubmissionDetailDrawer.tsx:241 patterns.
    const snapshot = body;
    // Optimistic local clear so the editor visibly empties while pending.
    // (Set back from `snapshot` on failure below.)
    setBody("");
    setBusy(true);
    try {
      const ok = await onSubmitReply(trimmed);
      if (!ok) {
        // Restore the typed content so the user can retry / edit.
        setBody(snapshot);
      }
    } catch (err: unknown) {
      // Hard throw — restore the draft and surface inline + via parent toast.
      setBody(snapshot);
      setError(getErrorMessage(err, "Failed to post reply."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
        >
          {error}
        </div>
      )}
      {/* Editor stores HTML — DB body column accepts string transparently. */}
      <MarkdownEditor
        value={body}
        onChange={setBody}
        placeholder={placeholder ?? "Write a reply…"}
        minHeight={80}
        characterLimit={MAX_POST_LEN}
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5"
        >
          {busy ? "Posting…" : "Post reply"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
