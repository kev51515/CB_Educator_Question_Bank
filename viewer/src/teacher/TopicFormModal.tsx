/**
 * TopicFormModal
 * ==============
 * Unified create / edit form for a discussion topic. Mirrors the shape of
 * AnnouncementFormModal so the two surfaces feel of a piece.
 *
 * Round 47 (this revision) layered on:
 *   - Live per-field validation (title, body) with `touched` gating so we
 *     don't shout at the user before they've interacted with a field.
 *   - Submit gating tied to whole-form validity, with a hover tooltip that
 *     tells the user *why* Save is disabled.
 *   - Draft auto-save (create mode only) to
 *     `teacher.topicForm.draft:${courseId}` in localStorage with a 500ms
 *     debounce. On open we offer to restore any draft ≤ 7 days old via an
 *     amber banner; older drafts are silently dropped.
 *   - Cancel-with-dirty-draft confirm: an inline amber banner asks the user
 *     to Discard / Keep editing instead of nuking their work on a stray click.
 *   - Unmount-flush of the pending debounced draft so the modal closing
 *     mid-debounce doesn't drop the last few keystrokes (mirrors Round 46's
 *     AssignmentFormModal pattern).
 *   - Drafts are cleared only AFTER the server confirms the insert, so a
 *     slow network on submit can't lose the user's work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Draft persistence constants. */
const DRAFT_KEY_PREFIX = "teacher.topicForm.draft:";
const DRAFT_DEBOUNCE_MS = 500;
const DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Persisted draft shape. Only used in create mode. */
interface TopicDraft {
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  savedAt: number;
}

/** Per-field error map. `null` means the field is currently valid. */
type FieldKey = "title" | "body";
type FieldErrors = Partial<Record<FieldKey, string | null>>;
type TouchedFields = Partial<Record<FieldKey, boolean>>;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/** Lightweight relative time formatter — "just now" / "5m ago" / "3h ago" /
 *  "2d ago". Used for the draft restore banner. */
function formatRelativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getDraftKey(courseId: string): string {
  return `${DRAFT_KEY_PREFIX}${courseId}`;
}

function readDraft(courseId: string): TopicDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getDraftKey(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TopicDraft;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.savedAt > DRAFT_STALE_MS) {
      // Stale — wipe and treat as absent.
      window.localStorage.removeItem(getDraftKey(courseId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(courseId: string, draft: TopicDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getDraftKey(courseId), JSON.stringify(draft));
  } catch {
    // Quota errors etc. — swallow; draft is a non-essential nicety.
  }
}

function clearDraft(courseId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getDraftKey(courseId));
  } catch {
    // ignore
  }
}

/** Pure validators per field. Returns an error string or null. */
function validateTitle(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Title is required.";
  if (value.length > MAX_TITLE_LEN) {
    return `Title must be ${MAX_TITLE_LEN} characters or fewer.`;
  }
  return null;
}

function validateBody(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Message is required.";
  if (value.length > MAX_BODY_LEN) {
    return `Message must be ${MAX_BODY_LEN} characters or fewer.`;
  }
  return null;
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

  // Per-field validation state.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<TouchedFields>({});

  // Draft restore banner. `null` = no offer pending; a draft object means we
  // are presenting the user with a Restore/Discard choice.
  const [pendingRestore, setPendingRestore] = useState<TopicDraft | null>(null);

  // Cancel-confirm inline banner — set when user clicks Cancel with a dirty
  // draft.
  const [confirmCancel, setConfirmCancel] = useState(false);

  const toast = useToast();

  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  // Debounce timer + latest-state ref for draft writes. We keep a ref to the
  // current form values so the cleanup function (used to flush on unmount)
  // can persist whatever the user typed last without re-running the effect
  // on every keystroke.
  const draftTimerRef = useRef<number | null>(null);
  const latestDraftRef = useRef<TopicDraft | null>(null);
  // Flag set after a successful insert so the unmount-flush no-ops instead
  // of re-creating the draft we just cleared.
  const submittedRef = useRef(false);

  /** Convenience: are we in create mode? Draft logic is gated on this. */
  const isCreate = mode === "create";

  // ---------------------------------------------------------------------------
  // Initial state + draft load on open
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    submittedRef.current = false;
    setFieldErrors({});
    setTouched({});
    setConfirmCancel(false);
    setPendingRestore(null);

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
      const draft = readDraft(courseId);
      if (draft) setPendingRestore(draft);
    }
    setError(null);
    const id = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, mode, initialTopic, courseId]);

  // ---------------------------------------------------------------------------
  // Esc to close
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ---------------------------------------------------------------------------
  // Live validation: re-validate touched fields whenever their value changes.
  // We deliberately don't surface errors for untouched fields so the form
  // doesn't shout at the user on first open.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setFieldErrors((prev) => {
      const next: FieldErrors = { ...prev };
      if (touched.title) next.title = validateTitle(title);
      if (touched.body) next.body = validateBody(body);
      return next;
    });
  }, [title, body, touched]);

  // Whole-form validity (used to gate submit). We compute against the actual
  // values rather than `fieldErrors` so the button reflects validity even for
  // fields the user hasn't touched yet (e.g. they paste a title and hit Save
  // — we still want Save disabled if body is blank).
  const isValid = useMemo(() => {
    return validateTitle(title) === null && validateBody(body) === null;
  }, [title, body]);

  // ---------------------------------------------------------------------------
  // Draft persistence (create mode only)
  // ---------------------------------------------------------------------------

  /** Has the user actually entered anything draft-worthy? We avoid writing a
   *  draft for an untouched form so opening the modal once doesn't litter
   *  localStorage with an empty placeholder. */
  const isDirty = useMemo(() => {
    if (!isCreate) return false;
    return (
      title.trim().length > 0 ||
      body.trim().length > 0 ||
      pinned !== false ||
      locked !== false
    );
  }, [isCreate, title, body, pinned, locked]);

  // Debounced draft writer.
  useEffect(() => {
    if (!open || !isCreate) return;
    // Don't overwrite a draft we're actively offering to restore — the user
    // hasn't decided yet whether to keep it.
    if (pendingRestore) return;
    if (!isDirty) return;

    const draft: TopicDraft = {
      title,
      body,
      pinned,
      locked,
      savedAt: Date.now(),
    };
    latestDraftRef.current = draft;

    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = window.setTimeout(() => {
      writeDraft(courseId, draft);
      draftTimerRef.current = null;
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [open, isCreate, pendingRestore, isDirty, courseId, title, body, pinned, locked]);

  // Final flush on unmount: if the modal closes before the debounce fires,
  // persist whatever we have so the user doesn't lose their work. We skip
  // this if the user just submitted successfully (draft is intentionally
  // cleared) or if there's nothing dirty.
  useEffect(() => {
    return () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      if (
        isCreate &&
        !submittedRef.current &&
        latestDraftRef.current !== null
      ) {
        writeDraft(courseId, latestDraftRef.current);
      }
    };
    // We intentionally use [] so this only runs on unmount. `courseId` is
    // captured via closure but is stable for any single mounted instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Restore / discard draft handlers
  // ---------------------------------------------------------------------------
  const handleRestoreDraft = useCallback(() => {
    if (!pendingRestore) return;
    const d = pendingRestore;
    setTitle(d.title);
    setBody(d.body);
    setPinned(d.pinned);
    setLocked(d.locked);
    setPendingRestore(null);
    // The user might immediately tweak something — touch happens on blur as
    // usual; we don't pre-touch.
  }, [pendingRestore]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft(courseId);
    latestDraftRef.current = null;
    setPendingRestore(null);
  }, [courseId]);

  // ---------------------------------------------------------------------------
  // Cancel flow — confirm discard if there's a dirty draft
  // ---------------------------------------------------------------------------
  const handleCancelClick = useCallback(() => {
    if (isCreate && isDirty && !pendingRestore) {
      setConfirmCancel(true);
      return;
    }
    onClose();
  }, [isCreate, isDirty, pendingRestore, onClose]);

  const handleConfirmDiscardAndClose = useCallback(() => {
    // User explicitly chose to discard. Clear the persisted draft AND mark
    // submitted so the unmount-flush doesn't re-persist it.
    clearDraft(courseId);
    latestDraftRef.current = null;
    submittedRef.current = true;
    setConfirmCancel(false);
    onClose();
  }, [courseId, onClose]);

  const handleKeepEditing = useCallback(() => {
    setConfirmCancel(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Touch helper
  // ---------------------------------------------------------------------------
  const markTouched = useCallback((field: FieldKey) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  if (!open) return null;

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Touch all fields so any lingering errors surface, then short-circuit
    // and focus the first invalid one.
    const allTouched: TouchedFields = { title: true, body: true };
    setTouched(allTouched);

    const titleErr = validateTitle(title);
    const bodyErr = validateBody(body);
    setFieldErrors({ title: titleErr, body: bodyErr });

    if (titleErr) {
      titleRef.current?.focus();
      return;
    }
    if (bodyErr) {
      // MarkdownEditor doesn't expose a focusable ref, so we just surface the
      // inline error and let the user click into it.
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

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

      // Server confirmed — now (and only now) it's safe to drop the draft.
      submittedRef.current = true;
      clearDraft(courseId);
      latestDraftRef.current = null;

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

  // Per-field error ids for aria-describedby wiring.
  const titleErrId = "topic-title-error";
  const bodyErrId = "topic-body-error";

  // Tooltip wording for the disabled Save button — mirror the brief.
  const disabledTooltip = !isValid && !busy
    ? title.trim().length === 0
      ? "Add a title to post the topic"
      : "Fix the highlighted fields"
    : undefined;

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

        {/* Draft restore banner — create mode only, only when a non-stale
            draft was found on open and the user hasn't decided yet. */}
        {isCreate && pendingRestore && (
          <div
            role="status"
            className="rounded-md border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Restore draft from{" "}
                <strong>{formatRelativeTime(pendingRestore.savedAt)}</strong>?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRestoreDraft}
                  className="min-h-[40px] md:min-h-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="min-h-[40px] md:min-h-0 rounded-md px-3 py-1 text-xs font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inline confirm-cancel banner — shown when the user clicks Cancel
            with unsaved draft content. */}
        {confirmCancel && (
          <div
            role="status"
            className="rounded-md border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Discard draft and close?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmDiscardAndClose}
                  className="min-h-[40px] md:min-h-0 rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleKeepEditing}
                  className="min-h-[40px] md:min-h-0 rounded-md px-3 py-1 text-xs font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
              onBlur={() => markTouched("title")}
              maxLength={MAX_TITLE_LEN}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? titleErrId : undefined}
              className={`mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                fieldErrors.title
                  ? "border-rose-400 dark:border-rose-600 focus:ring-rose-500"
                  : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
              }`}
              placeholder="e.g. Help with problem #12"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              {fieldErrors.title ? (
                <span
                  id={titleErrId}
                  role="alert"
                  className="text-xs text-rose-600 dark:text-rose-400"
                >
                  {fieldErrors.title}
                </span>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  &nbsp;
                </span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400 flex-none">
                {title.length} / {MAX_TITLE_LEN}
              </span>
            </div>
          </label>

          <div className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Message
            </span>
            <div
              className={`mt-1 rounded-lg ${
                fieldErrors.body
                  ? "ring-2 ring-rose-400 dark:ring-rose-600"
                  : ""
              }`}
            >
              {/* Editor stores HTML — DB body column accepts string transparently.
                  We touch the body field on first change so validation kicks in
                  as soon as the user starts typing (MarkdownEditor doesn't have
                  a meaningful onBlur). */}
              <MarkdownEditor
                value={body}
                onChange={(next) => {
                  setBody(next);
                  if (!touched.body) markTouched("body");
                }}
                placeholder="What do you want to discuss?"
                characterLimit={MAX_BODY_LEN}
              />
            </div>
            {fieldErrors.body && (
              <span
                id={bodyErrId}
                role="alert"
                className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
              >
                {fieldErrors.body}
              </span>
            )}
          </div>

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
              onClick={handleCancelClick}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !isValid}
              aria-disabled={busy || !isValid}
              title={disabledTooltip}
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
