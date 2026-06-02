/**
 * SubmissionDetailDrawer
 * ======================
 * Right-side panel showing one student's submission for one portfolio item.
 * Renders the value according to item_type, plus an inline feedback thread.
 *
 * Loads the submission row + every feedback row on mount. New feedback posts
 * append optimistically; the realtime story is intentionally out of scope.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { PortfolioItem } from "./usePortfolio";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useFocusTrap } from "../hooks";

const STORAGE_BUCKET = "portfolio-files";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface SubmissionRow {
  id: string;
  item_id: string;
  student_id: string;
  status: string;
  submitted_at: string | null;
  value_text: string | null;
  value_url: string | null;
  value_file_path: string | null;
  value_file_size: number | null;
  value_file_mime: string | null;
  value_number: number | string | null;
  value_date: string | null;
  value_choice: string | null;
  value_multi_choice: string[] | null;
  updated_at: string;
}

interface FeedbackRow {
  id: string;
  submission_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { display_name: string | null; email: string } | null;
}

interface FeedbackEntry {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface SubmissionDetailDrawerProps {
  open: boolean;
  item: PortfolioItem;
  studentId: string;
  studentLabel: string;
  authorId: string;
  onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function authorLabel(row: FeedbackRow): string {
  if (row.author?.display_name) return row.author.display_name;
  if (row.author?.email) return row.author.email;
  return "Staff";
}

export function SubmissionDetailDrawer({
  open,
  item,
  studentId,
  studentLabel,
  authorId,
  onClose,
}: SubmissionDetailDrawerProps) {
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [signedFileUrl, setSignedFileUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const toast = useToast();
  const panelRef = useRef<HTMLElement | null>(null);
  useFocusTrap(panelRef, open);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data: subData, error: subErr } = await supabase
        .from("portfolio_submissions")
        .select(
          "id, item_id, student_id, status, submitted_at, value_text, value_url, value_file_path, value_file_size, value_file_mime, value_number, value_date, value_choice, value_multi_choice, updated_at",
        )
        .eq("item_id", item.id)
        .eq("student_id", studentId)
        .maybeSingle();
      if (subErr) {
        setError(subErr.message);
        return;
      }
      const sub = (subData ?? null) as unknown as SubmissionRow | null;
      setSubmission(sub);

      // Sign the file value if present.
      if (sub?.value_file_path) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(sub.value_file_path, SIGNED_URL_TTL_SECONDS);
        if (!signErr && signed?.signedUrl) {
          setSignedFileUrl(signed.signedUrl);
        } else {
          setSignedFileUrl(null);
        }
      } else {
        setSignedFileUrl(null);
      }

      if (sub) {
        const { data: fbData, error: fbErr } = await supabase
          .from("portfolio_feedback")
          .select(
            "id, submission_id, author_id, body, created_at, author:profiles!portfolio_feedback_author_id_fkey(display_name, email)",
          )
          .eq("submission_id", sub.id)
          .order("created_at", { ascending: true });
        if (fbErr) {
          setError(fbErr.message);
          return;
        }
        const rows = (fbData ?? []) as unknown as FeedbackRow[];
        setFeedback(
          rows.map((r) => ({
            id: r.id,
            authorId: r.author_id,
            authorName: authorLabel(r),
            body: r.body,
            createdAt: r.created_at,
          })),
        );
      } else {
        setFeedback([]);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load submission."));
    } finally {
      setLoading(false);
    }
  }, [item.id, studentId]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !posting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, posting]);

  if (!open) return null;

  const postComment = async (): Promise<void> => {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    if (!submission) {
      const msg = "Student has not started this item yet.";
      setPostError(msg);
      toast.error("Couldn't post comment", msg);
      return;
    }

    // Optimistic append — surface the new comment immediately, then reconcile.
    const tempId = `pending-${Date.now()}`;
    const optimistic: FeedbackEntry = {
      id: tempId,
      authorId: authorId,
      authorName: "You",
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    setFeedback((prev) => [...prev, optimistic]);
    setNewComment("");
    setPosting(true);
    setPostError(null);

    try {
      const { data, error: insertErr } = await supabase
        .from("portfolio_feedback")
        .insert({
          submission_id: submission.id,
          author_id: authorId,
          body: trimmed,
        })
        .select(
          "id, submission_id, author_id, body, created_at, author:profiles!portfolio_feedback_author_id_fkey(display_name, email)",
        )
        .single();
      if (insertErr) {
        throw insertErr;
      }
      const row = data as unknown as FeedbackRow;
      // Replace the optimistic placeholder with the real, server-authored row.
      setFeedback((prev) =>
        prev.map((c) =>
          c.id === tempId
            ? {
                id: row.id,
                authorId: row.author_id,
                authorName: authorLabel(row),
                body: row.body,
                createdAt: row.created_at,
              }
            : c,
        ),
      );
      toast.success("Comment posted");
    } catch (err: unknown) {
      // Rollback: drop the optimistic comment and restore the draft.
      setFeedback((prev) => prev.filter((c) => c.id !== tempId));
      setNewComment(trimmed);
      const msg = getErrorMessage(err, "Failed to post comment.");
      setPostError(msg);
      toast.error("Couldn't post comment", msg);
    } finally {
      setPosting(false);
    }
  };

  const renderValue = (): React.ReactNode => {
    if (!submission) {
      return (
        <p className="text-sm text-slate-500 dark:text-slate-400 italic">
          Student has not started this item yet.
        </p>
      );
    }
    switch (item.item_type) {
      case "short_text":
      case "long_text":
        return submission.value_text ? (
          <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap">
            {submission.value_text}
          </p>
        ) : (
          <p className="text-sm text-slate-500 italic">(empty)</p>
        );
      case "link":
        return submission.value_url ? (
          <a
            href={submission.value_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-700 dark:text-indigo-300 hover:underline break-all"
          >
            {submission.value_url}
          </a>
        ) : (
          <p className="text-sm text-slate-500 italic">(empty)</p>
        );
      case "file":
        return submission.value_file_path ? (
          signedFileUrl ? (
            <a
              href={signedFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-700 dark:text-indigo-300 hover:underline break-all"
            >
              Download file
              {submission.value_file_size
                ? ` (${submission.value_file_size} bytes)`
                : ""}
            </a>
          ) : (
            <p className="text-sm text-amber-600">File link unavailable.</p>
          )
        ) : (
          <p className="text-sm text-slate-500 italic">(empty)</p>
        );
      case "number":
        return submission.value_number !== null &&
          submission.value_number !== undefined ? (
          <p className="text-sm text-slate-800 dark:text-slate-100">
            {String(submission.value_number)}
          </p>
        ) : (
          <p className="text-sm text-slate-500 italic">(empty)</p>
        );
      case "date":
        return submission.value_date ? (
          <p className="text-sm text-slate-800 dark:text-slate-100">
            {submission.value_date}
          </p>
        ) : (
          <p className="text-sm text-slate-500 italic">(empty)</p>
        );
      case "choice":
        return submission.value_choice ? (
          <p className="text-sm text-slate-800 dark:text-slate-100">
            {submission.value_choice}
          </p>
        ) : (
          <p className="text-sm text-slate-500 italic">(empty)</p>
        );
      case "multi_choice":
        return submission.value_multi_choice &&
          submission.value_multi_choice.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-100">
            {submission.value_multi_choice.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 italic">(empty)</p>
        );
      default:
        return null;
    }
  };

  const status = submission?.status ?? "not_started";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Submission detail"
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm"
      onClick={() => {
        if (!posting) onClose();
      }}
    >
      <aside
        ref={panelRef}
        className="h-full w-full max-w-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {studentLabel}
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {item.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </header>

        <div className="px-5 py-4 space-y-5">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                status === "submitted"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900"
                  : status === "draft"
                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700"
              }`}
            >
              {status === "submitted"
                ? "Submitted"
                : status === "draft"
                  ? "Draft"
                  : "Not started"}
            </span>
            {submission?.submitted_at && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {formatDateTime(submission.submitted_at)}
              </span>
            )}
          </div>

          {loading ? (
            <section className="rounded-xl bg-slate-50 dark:bg-slate-950/40 ring-1 ring-slate-200 dark:ring-slate-800 p-3 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-5/6 rounded" />
            </section>
          ) : error ? (
            <p
              role="alert"
              className="text-sm text-rose-700 dark:text-rose-300"
            >
              {error}
            </p>
          ) : (
            <section className="rounded-xl bg-slate-50 dark:bg-slate-950/40 ring-1 ring-slate-200 dark:ring-slate-800 p-3">
              {renderValue()}
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Feedback
            </h3>
            {feedback.length === 0 ? (
              <EmptyState
                title="No feedback yet"
                body="Leave the first comment for this submission below."
              />
            ) : (
              <ul className="space-y-2">
                {feedback.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        {c.authorName}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {formatDateTime(c.createdAt)}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap">
                      {c.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {postError && (
              <p
                role="alert"
                className="mt-3 text-xs text-rose-700 dark:text-rose-300"
              >
                {postError}
              </p>
            )}

            <div className="mt-3 space-y-2">
              <MarkdownEditor
                value={newComment}
                onChange={setNewComment}
                placeholder="Leave inline feedback…"
                disabled={posting || !submission}
                minHeight={96}
              />
              <button
                type="button"
                onClick={() => {
                  void postComment();
                }}
                disabled={posting || !submission || newComment.trim().length === 0}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
              >
                {posting ? "Posting…" : "Post comment"}
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
