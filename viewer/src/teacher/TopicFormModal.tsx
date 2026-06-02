/**
 * TopicFormModal
 * ==============
 * Unified create / edit form for a discussion topic. Mirrors the shape of
 * AnnouncementFormModal so the two surfaces feel of a piece.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useToast } from "@/components";
import type { DiscussionTopic } from "./useDiscussions";
import { useFocusTrap } from "../hooks";

export type TopicFormMode = "create" | "edit";

interface TopicFormModalProps {
  open: boolean;
  mode: TopicFormMode;
  courseId: string;
  authorId: string;
  /** Required when mode === "edit". */
  initialTopic?: DiscussionTopic;
  onClose: () => void;
  onCreated?: (topicId: string) => void;
  onUpdated?: () => void;
}

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 10000;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

interface InsertedTopicRow {
  id: string;
}

export function TopicFormModal({
  open,
  mode,
  courseId,
  authorId,
  initialTopic,
  onClose,
  onCreated,
  onUpdated,
}: TopicFormModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initialTopic) {
      setTitle(initialTopic.title);
      setBody(initialTopic.body);
      setPinned(initialTopic.pinned);
      setLocked(initialTopic.locked);
    } else {
      setTitle("");
      setBody("");
      setPinned(false);
      setLocked(false);
    }
    setError(null);
    const id = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, mode, initialTopic]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      setError("Please enter a title.");
      return;
    }
    if (trimmedTitle.length > MAX_TITLE_LEN) {
      setError(`Title must be ${MAX_TITLE_LEN} characters or fewer.`);
      return;
    }
    if (!trimmedBody) {
      setError("Please enter a message.");
      return;
    }
    if (trimmedBody.length > MAX_BODY_LEN) {
      setError(`Message must be ${MAX_BODY_LEN} characters or fewer.`);
      return;
    }

    setBusy(true);
    try {
      if (mode === "edit" && initialTopic) {
        const { error: updateError } = await supabase
          .from("discussion_topics")
          .update({
            title: trimmedTitle,
            body: trimmedBody,
            pinned,
            locked,
          })
          .eq("id", initialTopic.id);

        if (updateError) {
          setError(updateError.message);
          toast.error("Couldn't save topic", updateError.message);
          return;
        }
        toast.success("Topic updated");
        onUpdated?.();
        onClose();
        return;
      }

      const { data, error: insertError } = await supabase
        .from("discussion_topics")
        .insert({
          course_id: courseId,
          author_id: authorId,
          title: trimmedTitle,
          body: trimmedBody,
          pinned,
          locked,
        })
        .select("id")
        .single();

      if (insertError) {
        setError(insertError.message);
        toast.error("Couldn't save topic", insertError.message);
        return;
      }

      const inserted = data as unknown as InsertedTopicRow | null;
      if (inserted?.id) {
        onCreated?.(inserted.id);
      }
      toast.success("Topic created");
      onClose();
    } catch (err: unknown) {
      const msg = getErrorMessage(
        err,
        mode === "edit"
          ? "Failed to update topic."
          : "Failed to create topic.",
      );
      setError(msg);
      toast.error("Couldn't save topic", msg);
    } finally {
      setBusy(false);
    }
  };

  const titleId =
    mode === "edit" ? "edit-topic-title" : "create-topic-title";
  const headingText = mode === "edit" ? "Edit topic" : "New discussion topic";
  const subheading =
    mode === "edit"
      ? "Update the topic — your changes will be visible to everyone in this course."
      : "Start a thread for everyone enrolled in this course.";
  const submitLabel = busy
    ? mode === "edit"
      ? "Saving…"
      : "Creating…"
    : mode === "edit"
      ? "Save changes"
      : "Create topic";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2
              id={titleId}
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {headingText}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {subheading}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 md:p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
            >
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Title
            </span>
            <input
              ref={titleRef}
              data-autofocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE_LEN}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Help with problem #12"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              {title.length} / {MAX_TITLE_LEN}
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Message
            </span>
            <div className="mt-1">
              {/* Editor stores HTML — DB body column accepts string transparently. */}
              <MarkdownEditor
                value={body}
                onChange={setBody}
                placeholder="What do you want to discuss?"
                characterLimit={MAX_BODY_LEN}
              />
            </div>
          </label>

          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">Pin to top</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Pinned topics appear above unpinned ones.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={locked}
                onChange={(e) => setLocked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">Lock replies</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  When locked, nobody can post new replies (existing posts stay
                  visible).
                </span>
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
