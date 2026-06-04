/**
 * ClassFormModal
 * ==============
 * Unified create/edit form for a course. Used both from TeacherConsole (create)
 * and from ClassDetailView (edit). In create mode it mirrors the original
 * CreateClassModal behaviour — including generating a human-friendly join
 * code client-side and showing it on the success screen. In edit mode it
 * pre-populates from `initialClass` and updates the existing row in place.
 *
 * Why one component for both modes: every field overlaps (name, description,
 * archived), only the submit action differs. Forking two components would
 * have doubled the styling + state surface for no real benefit.
 *
 * Backward compatibility: the legacy export name `CreateClassModal` is kept
 * so existing call-sites keep working.
 *
 * Round 53 (this revision):
 * - Live validation per field with `touched` set — errors only surface for
 *   fields the user has interacted with, but `isValid` is computed off raw
 *   values so the Save button stays disabled even when nothing is touched.
 * - Draft auto-save (create mode only) to localStorage at
 *   `teacher.classForm.draft` with a 500ms debounce. `pendingDraftRef`
 *   mirrors the latest unflushed draft so unmount cleanup can flush it
 *   synchronously.
 * - Restore banner on re-open if a draft exists and is < 7 days old; while
 *   the banner is visible the debounced writer is paused.
 * - Discard-with-dirty confirm banner on Cancel.
 * Mirrors the Round 46 AssignmentFormModal + Round 52 TopicFormModal
 * patterns so behaviour stays consistent across the create surfaces.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCourseTemplates } from "./useCourseTemplates";
import { DuplicateCourseModal } from "./DuplicateCourseModal";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { useFocusTrap } from "@/hooks";

export type ClassFormMode = "create" | "edit";

export interface EditableClass {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
}

interface ClassFormModalProps {
  open: boolean;
  mode: ClassFormMode;
  teacherId: string;
  /** Required when mode === "edit". */
  initialClass?: EditableClass;
  onClose: () => void;
  /** Called after a successful create so the parent can refresh. */
  onCreated?: (created: CreatedClass) => void;
  /** Called after a successful edit so the parent can refresh. */
  onUpdated?: (updated: EditableClass) => void;
}

export interface CreatedClass {
  id: string;
  name: string;
  description: string | null;
  join_code: string;
}

// Why this alphabet: visually unambiguous characters only. We drop the
// look-alikes O/0, I/1, and L. That keeps the human-readable codes robust
// over voice / handwritten contexts.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;
const DRAFT_KEY = "teacher.classForm.draft";
const DRAFT_DEBOUNCE_MS = 500;
const DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type FieldKey = "name" | "description";

interface ClassDraft {
  name: string;
  description: string;
  savedAt: number;
}

function randomFromAlphabet(length: number): string {
  // crypto.getRandomValues for unbiased-ish sampling. We tolerate the slight
  // modulo bias because the alphabet size (31) is small relative to 256.
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = (buf[i] ?? 0) % ALPHABET.length;
    out += ALPHABET[idx];
  }
  return out;
}

function generateJoinCode(): string {
  // Format: 4 chars - 4 chars, e.g. ABCD-2345
  return `${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;
}

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

function readDraft(): ClassDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClassDraft;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.savedAt > DRAFT_STALE_MS) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(draft: ClassDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Quota / private-mode — swallow; draft is a non-essential nicety.
  }
}

function clearStoredDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/** Pure validators per field. Returns an error string or null. */
function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Course name is required.";
  if (value.length > MAX_NAME_LENGTH) {
    return `Course name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

function validateDescription(value: string): string | null {
  if (value.length > MAX_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }
  return null;
}

export function ClassFormModal({
  open,
  mode,
  teacherId,
  initialClass,
  onClose,
  onCreated,
  onUpdated,
}: ClassFormModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedClass | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateSource, setTemplateSource] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const { templates, loading: templatesLoading } = useCourseTemplates();
  const toast = useToast();

  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

  // Draft-restore UX (create mode only)
  const [pendingRestore, setPendingRestore] = useState<ClassDraft | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const nameRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  const draftTimerRef = useRef<number | null>(null);
  const pendingDraftRef = useRef<ClassDraft | null>(null);
  /** Set to true after a successful submit so unmount cleanup doesn't
   *  flush the just-submitted (and just-cleared) draft. */
  const submittedRef = useRef(false);

  // --- Reset state on open / mode / initialClass change ---
  useEffect(() => {
    if (!open) return;
    submittedRef.current = false;
    setShowCancelConfirm(false);
    setTouched({});
    setErrors({});

    if (mode === "edit" && initialClass) {
      setName(initialClass.name);
      setDescription(initialClass.description ?? "");
      setArchived(initialClass.archived);
      setPendingRestore(null);
    } else {
      // Create mode — check for a saved draft. We don't auto-populate; we
      // show a banner asking the teacher to confirm. Until they decide,
      // the form is empty and the debounced writer is paused.
      const draft = readDraft();
      if (draft) {
        setName("");
        setDescription("");
        setPendingRestore(draft);
      } else {
        setName("");
        setDescription("");
        setPendingRestore(null);
      }
      setArchived(false);
    }
    setCreated(null);
    setCopied(false);
    setShowTemplatePicker(false);
    setTemplateSource(null);

    const id = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, mode, initialClass]);

  // --- Esc to close (also dismisses cancel-confirm if showing) ---
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showCancelConfirm) {
          setShowCancelConfirm(false);
          return;
        }
        handleClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showCancelConfirm]);

  // --- Live validation: re-run validators on every (values, touched) change,
  //     but only write errors for touched fields. ---
  useEffect(() => {
    const next: Partial<Record<FieldKey, string>> = {};
    if (touched.name) {
      const err = validateName(name);
      if (err) next.name = err;
    }
    if (touched.description) {
      const err = validateDescription(description);
      if (err) next.description = err;
    }
    setErrors(next);
  }, [name, description, touched]);

  // --- isValid: computed off raw values (not touched-gated) so Save stays
  //     disabled even when nothing has been touched yet. ---
  const isValid = useMemo(() => {
    if (validateName(name) !== null) return false;
    if (validateDescription(description) !== null) return false;
    return true;
  }, [name, description]);

  // --- Whether the form has any draftable content. Used to gate the
  //     cancel-confirm banner. ---
  const hasDirtyDraft = useMemo(() => {
    return name.trim().length > 0 || description.trim().length > 0;
  }, [name, description]);

  // --- Draft auto-save (create mode only, paused while restore banner is up,
  //     paused while submitting, cleared after successful submit). ---
  useEffect(() => {
    if (!open) return;
    if (mode !== "create") return;
    if (pendingRestore) return; // banner showing — pause writer
    if (created) return; // success screen — nothing more to save
    if (submittedRef.current) return;

    // If everything's empty, treat as "no draft" — clear any existing.
    if (!hasDirtyDraft) {
      pendingDraftRef.current = null;
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      clearStoredDraft();
      return;
    }

    const draft: ClassDraft = {
      name,
      description,
      savedAt: Date.now(),
    };
    pendingDraftRef.current = draft;

    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = window.setTimeout(() => {
      if (pendingDraftRef.current) {
        writeDraft(pendingDraftRef.current);
      }
      draftTimerRef.current = null;
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [open, mode, name, description, pendingRestore, created, hasDirtyDraft]);

  // --- Synchronous flush on unmount so a fast Cmd-W doesn't lose work. ---
  useEffect(() => {
    return () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      if (
        mode === "create" &&
        !submittedRef.current &&
        pendingDraftRef.current
      ) {
        writeDraft(pendingDraftRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    if (mode === "create" && hasDirtyDraft && !created) {
      // Don't bail out yet — confirm.
      setShowCancelConfirm(true);
      return;
    }
    onClose();
  };

  const handleRestoreDraft = () => {
    if (!pendingRestore) return;
    setName(pendingRestore.name);
    setDescription(pendingRestore.description);
    setPendingRestore(null);
    // Mark as touched so any pre-existing validation errors surface
    // immediately rather than silently waiting for a blur.
    setTouched({ name: true, description: true });
  };

  const handleDiscardDraft = () => {
    clearStoredDraft();
    pendingDraftRef.current = null;
    setPendingRestore(null);
  };

  const handleConfirmCancel = () => {
    // User chose "Discard draft and close".
    clearStoredDraft();
    pendingDraftRef.current = null;
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    setShowCancelConfirm(false);
    onClose();
  };

  const focusFirstInvalid = useCallback(() => {
    if (validateName(name) !== null) {
      nameRef.current?.focus();
      return;
    }
    // Description lives inside MarkdownEditor — no direct ref. Best-effort:
    // the only other validatable field. No-op if MarkdownEditor unavailable.
  }, [name]);

  // Closed-and-no-template → render nothing. Kept BELOW every hook so the hook
  // order is identical whether the modal is open or closed (rules-of-hooks).
  if (!open && !templateSource) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) {
      // Touch everything so the errors surface.
      setTouched({ name: true, description: true });
      focusFirstInvalid();
      return;
    }

    const trimmedName = name.trim();

    setBusy(true);
    try {
      if (mode === "edit" && initialClass) {
        const { data, error: updateError } = await supabase
          .from("courses")
          .update({
            name: trimmedName,
            description: description.trim() || null,
            archived,
          })
          .eq("id", initialClass.id)
          .select("id, name, description, archived")
          .single();

        if (updateError) {
          toast.error("Couldn't save", updateError.message);
          return;
        }
        const updated: EditableClass = {
          id: data.id as string,
          name: data.name as string,
          description: (data.description as string | null) ?? null,
          archived: Boolean(data.archived),
        };
        toast.success("Course updated");
        onUpdated?.(updated);
        onClose();
        return;
      }

      // Create mode — retry on join_code uniqueness collision (PG error 23505).
      let attempts = 0;
      const maxAttempts = 5;
      while (attempts < maxAttempts) {
        attempts += 1;
        const joinCode = generateJoinCode();
        const { data, error: insertError } = await supabase
          .from("courses")
          .insert({
            teacher_id: teacherId,
            name: trimmedName,
            description: description.trim() || null,
            join_code: joinCode,
          })
          .select("id, name, description, join_code")
          .single();

        if (!insertError && data) {
          const createdClass: CreatedClass = {
            id: data.id as string,
            name: data.name as string,
            description: (data.description as string | null) ?? null,
            join_code: data.join_code as string,
          };
          // Server confirmed — now safe to clear the draft.
          submittedRef.current = true;
          pendingDraftRef.current = null;
          if (draftTimerRef.current !== null) {
            window.clearTimeout(draftTimerRef.current);
            draftTimerRef.current = null;
          }
          clearStoredDraft();
          setCreated(createdClass);
          toast.success("Course created");
          onCreated?.(createdClass);
          return;
        }

        if (insertError && insertError.code === "23505") {
          continue;
        }
        if (insertError) {
          toast.error("Couldn't save", insertError.message);
          return;
        }
      }
      toast.error("Couldn't save", "Couldn't generate a unique join code. Please try again.");
    } catch (err: unknown) {
      toast.error(
        "Couldn't save",
        getErrorMessage(
          err,
          mode === "edit" ? "Failed to update course." : "Failed to create course.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.join_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently no-op */
    }
  };

  const titleId =
    mode === "edit" ? "edit-class-title" : "create-class-title";
  const headingText = created
    ? "Course created"
    : mode === "edit"
      ? "Edit course"
      : "Create a course";
  const subheading = created
    ? "Share the join code with your students so they can enroll."
    : mode === "edit"
      ? "Update the course name, description, or archive status."
      : "Give your course a name. You can add a description if helpful.";

  const submitDisabled = busy || !isValid;
  const submitTitle = busy
    ? undefined
    : !isValid
      ? validateName(name) !== null
        ? "Add a name to create the course"
        : "Fix the highlighted fields"
      : undefined;

  const nameErrorId = "class-form-name-error";
  const descriptionErrorId = "class-form-description-error";

  return (
    <>
    {open && (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-2 right-2 inline-flex items-center justify-center w-10 h-10 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <header className="space-y-1 pr-8">
          <h2
            id={titleId}
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            {headingText}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {subheading}
          </p>
        </header>

        {created ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-900 px-4 py-4 text-center">
              <p className="text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Join code
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-indigo-900 dark:text-indigo-100">
                {created.join_code}
              </p>
              <button
                type="button"
                onClick={onCopy}
                className="mt-3 rounded-md bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-800 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950"
              >
                {copied ? "Copied" : "Copy code"}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {/* Draft restore banner (create mode only) */}
            {mode === "create" && pendingRestore && (
              <div
                role="status"
                className="rounded-md border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 ring-1 ring-amber-200 dark:ring-amber-900"
              >
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Restore draft from{" "}
                  <strong>{formatRelativeTime(pendingRestore.savedAt)}</strong>?
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRestoreDraft}
                    className="min-h-[40px] rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 dark:focus:ring-offset-slate-900"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscardDraft}
                    className="min-h-[40px] rounded-md bg-white dark:bg-slate-900 ring-1 ring-amber-300 dark:ring-amber-800 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* Cancel-with-dirty-draft confirm banner */}
            {showCancelConfirm && (
              <div
                role="alert"
                className="rounded-md border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 ring-1 ring-amber-200 dark:ring-amber-900"
              >
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  You have unsaved changes. Discard draft and close?
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmCancel}
                    className="min-h-[40px] rounded-md bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 dark:focus:ring-offset-slate-900"
                  >
                    Discard draft and close
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(false)}
                    className="min-h-[40px] rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Keep editing
                  </button>
                </div>
              </div>
            )}

            {mode === "create" && !pendingRestore && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {showTemplatePicker ? (
                  <div className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 p-2 space-y-1 max-h-40 overflow-y-auto">
                    {templatesLoading ? (
                      <div className="px-1 py-1">
                        <SkeletonRows count={3} rowClassName="h-6" />
                      </div>
                    ) : templates.length === 0 ? (
                      <p className="px-1 py-1">No templates yet.</p>
                    ) : (
                      templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTemplateSource({ id: t.id, name: t.name });
                            setShowTemplatePicker(false);
                            onClose();
                          }}
                          className="block w-full text-left rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          {t.name}
                        </button>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => setShowTemplatePicker(false)}
                      className="block w-full text-left rounded px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTemplatePicker(true)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Start from template?
                  </button>
                )}
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Course name
              </span>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                maxLength={MAX_NAME_LENGTH}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? nameErrorId : undefined}
                className={`mt-1 w-full min-h-[40px] rounded-lg border ${
                  errors.name
                    ? "border-rose-400 dark:border-rose-500 focus:ring-rose-500"
                    : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                } bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2`}
                placeholder="e.g. AP Calculus — Block 3"
              />
              {errors.name && (
                <p
                  id={nameErrorId}
                  role="alert"
                  className="mt-1 text-xs text-rose-600 dark:text-rose-400"
                >
                  {errors.name}
                </p>
              )}
            </label>
            <div className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Description{" "}
                <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
              </span>
              <div
                className="mt-1"
                onBlur={() => setTouched((t) => ({ ...t, description: true }))}
              >
                <MarkdownEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="What's this course for?"
                  minHeight={120}
                  characterLimit={500}
                />
              </div>
              {errors.description && (
                <p
                  id={descriptionErrorId}
                  role="alert"
                  className="mt-1 text-xs text-rose-600 dark:text-rose-400"
                >
                  {errors.description}
                </p>
              )}
            </div>
            {mode === "edit" && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(e) => setArchived(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-medium">Archived</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Archived courses stay visible to you and existing students,
                    but new students can't join using the code.
                  </span>
                </span>
              </label>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 min-h-[40px] rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitDisabled}
                aria-disabled={submitDisabled || undefined}
                title={submitTitle}
                className="flex-1 min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
              >
                {busy
                  ? mode === "edit"
                    ? "Saving…"
                    : "Creating…"
                  : mode === "edit"
                    ? "Save changes"
                    : "Create course"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
    )}
    <DuplicateCourseModal
      open={!!templateSource}
      source={templateSource}
      onClose={() => setTemplateSource(null)}
    />
    </>
  );
}

// Backward-compat alias for existing call-sites that imported the old name.
// Both behave identically because they're the same component — callers that
// don't pass `mode` will default to create via the wrapper below.
type CreateClassModalCompatProps = Omit<ClassFormModalProps, "mode">;
export function CreateClassModal(props: CreateClassModalCompatProps) {
  return <ClassFormModal {...props} mode="create" />;
}
