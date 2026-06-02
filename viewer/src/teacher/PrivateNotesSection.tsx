// --- Private notes section --------------------------------------------------
//
// Lives between the header and the activity sections. Visible only to
// teachers (the whole page is teacher-only). Mirrors the Section shell's
// collapsible visual language but renders a richer header (lock icon +
// "Private — only visible to you" tagline) and a MarkdownEditor body
// with autosave on blur + a 2s debounce after typing pauses.
//
// Default-open rule: open when a note exists (so Maya/Daniel see what
// they wrote last time); closed when empty (so we don't push them into
// writing notes they don't want to). When empty + collapsed, the header
// label flips to "Add a private note about this student" so the
// affordance stays discoverable.
import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useStudentNotes } from "./useStudentNotes";
import { formatRelative } from "./studentProfileHelpers";

const NOTE_DEBOUNCE_MS = 2_000;

export function PrivateNotesSection({
  courseId,
  studentId,
}: {
  courseId: string | null;
  studentId: string | null;
}): JSX.Element {
  const toast = useToast();
  const { note, loading, error, saving, save } = useStudentNotes(
    courseId,
    studentId,
  );

  // Local editor state — seeded from the server row but typed-into freely.
  // Tracks the last *saved* value separately so save() is a no-op when
  // the user blurs without typing.
  const [bodyHtml, setBodyHtml] = useState<string>("");
  const lastSavedRef = useRef<string>("");
  const debounceTimerRef = useRef<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Open by default when a saved note exists. Empty -> collapsed so we
  // don't pressure the teacher to fill it in.
  const [open, setOpen] = useState<boolean>(false);
  // Track whether we've initialized from the server fetch yet so user-typed
  // edits don't get clobbered by a late-arriving fetch.
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (loading) return;
    if (initializedRef.current) return;
    const initial = note?.body ?? "";
    setBodyHtml(initial);
    lastSavedRef.current = initial;
    if (note?.updated_at) setLastSavedAt(note.updated_at);
    setOpen(initial.length > 0);
    initializedRef.current = true;
  }, [loading, note]);

  // When the student/course changes (e.g. the teacher navigates to a
  // different student profile), reset our init flag so we re-seed from
  // the freshly-fetched note.
  useEffect(() => {
    initializedRef.current = false;
    setBodyHtml("");
    lastSavedRef.current = "";
    setLastSavedAt(null);
    setOpen(false);
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, [courseId, studentId]);

  // Surface load errors via toast (one-shot — error string identity is
  // stable across renders until the next fetch).
  useEffect(() => {
    if (error) toast.error("Notes problem", error);
  }, [error, toast]);

  const persist = useCallback(
    async (html: string): Promise<void> => {
      if (html === lastSavedRef.current) return;
      const previous = lastSavedRef.current;
      lastSavedRef.current = html; // optimistic
      try {
        await save(html);
        setLastSavedAt(new Date().toISOString());
      } catch (err: unknown) {
        // useStudentNotes already exposed an error; roll back the optimistic ref
        lastSavedRef.current = previous;
        toast.error(
          "Couldn't save note",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [save, toast],
  );

  const onChange = useCallback(
    (html: string) => {
      setBodyHtml(html);
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        void persist(html);
      }, NOTE_DEBOUNCE_MS);
    },
    [persist],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (bodyHtml === lastSavedRef.current) return;
    await persist(bodyHtml);
  }, [bodyHtml, persist]);

  // Clean up any pending debounce on unmount so we don't fire a save after
  // the component is gone.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const hasContent = lastSavedRef.current.length > 0 || bodyHtml.length > 0;
  const collapsedLabel = hasContent
    ? "Your private notes"
    : "Add a private note about this student";

  const headerId = "private-notes-header";
  const panelId = "private-notes-panel";

  return (
    <section
      aria-labelledby={headerId}
      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 min-h-[44px] text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex items-center gap-2">
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="text-slate-500 dark:text-slate-400"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {open ? "Your private notes" : collapsedLabel}
          </span>
          <span
            title="Private — only visible to you"
            className="hidden sm:inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
          >
            Private — only you
          </span>
        </div>
        <span
          aria-hidden
          className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-5 pb-5">
          {loading ? (
            <Skeleton className="h-24 w-full rounded-md" />
          ) : (
            <>
              <div onBlur={() => void flush()}>
                <MarkdownEditor
                  value={bodyHtml}
                  onChange={onChange}
                  placeholder="What should you remember about this student? Conferences, pacing, family context, what's working…"
                  minHeight={140}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <svg
                  width={11}
                  height={11}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Only you can see this. Not shared with the student or other teachers.</span>
                <span aria-hidden>·</span>
                <span>
                  {saving
                    ? "Saving…"
                    : lastSavedAt
                      ? `Saved ${formatRelative(lastSavedAt)}`
                      : "Not saved yet"}
                </span>
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
