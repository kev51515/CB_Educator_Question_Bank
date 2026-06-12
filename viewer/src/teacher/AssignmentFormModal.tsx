/**
 * AssignmentFormModal
 * ===================
 * Unified create/edit form for an assignment. Used both from AssignmentsPage
 * (create) and from the assignment card actions menu (edit). Behavioral
 * differences live in the submit handler and the header copy; every field
 * is shared between modes.
 *
 * In edit mode the form pre-populates from `initialAssignment` and exposes
 * an `archived` checkbox so a teacher can toggle visibility without leaving
 * the modal.
 *
 * Wave 21D additions:
 * - **Live per-field validation** on blur (and re-validate on change once a
 *   field has been touched so errors clear as the user types a fix). Submit
 *   is disabled until the form is valid; clicking a disabled-looking submit
 *   surfaces the first invalid field via focus.
 * - **Draft persistence** in create mode only. Every field change writes a
 *   debounced (500ms) JSON snapshot to
 *   `teacher.assignmentForm.draft:${courseId}` in localStorage. On open we
 *   check for a non-stale draft (≤7 days old) and show an amber restore
 *   banner. The draft is cleared after a successful insert. Cancelling with
 *   pending draft content asks for confirmation.
 *
 * Backward compatibility: the legacy export name `CreateAssignmentModal` is
 * kept so existing call-sites keep working.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  Assignment,
  AssignmentDifficultyMix,
  AssignmentSourceId,
} from "./useAssignments";
import { ResponsiveModal, SmartDatePicker, useToast } from "@/components";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import {
  SOURCE_OPTIONS,
  DIFFICULTY_OPTIONS,
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  DEFAULT_QUESTION_COUNT,
  DEFAULT_TIME_LIMIT_MINUTES,
  DEFAULT_LATE_PENALTY_PERCENT,
  DEFAULT_GRACE_PERIOD_HOURS,
  MAX_TITLE_LENGTH,
  DRAFT_DEBOUNCE_MS,
  getErrorMessage,
  formatRelativeTime,
  readDraft,
  writeDraft,
  clearDraft,
  validateTitle,
  validateQuestionCount,
  validateTimeLimit,
  validateMaxAttempts,
  validateLatePenalty,
  validateGraceHours,
  type AssignmentPolicyRow,
  type AssignmentDraft,
  type FieldKey,
  type FieldErrors,
  type TouchedFields,
} from "@/teacher/assignment-form";

export type AssignmentFormMode = "create" | "edit";

interface AssignmentFormModalProps {
  open: boolean;
  mode: AssignmentFormMode;
  classId: string;
  teacherId: string;
  /** Required when mode === "edit". */
  initialAssignment?: Assignment;
  onClose: () => void;
  /** Called after a successful create so the parent can refresh. */
  onCreated?: () => void;
  /** Called after a successful edit so the parent can refresh. */
  onUpdated?: () => void;
}

export function AssignmentFormModal({
  open,
  mode,
  classId,
  teacherId,
  initialAssignment,
  onClose,
  onCreated,
  onUpdated,
}: AssignmentFormModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceId, setSourceId] = useState<AssignmentSourceId>("cb");
  const [questionCount, setQuestionCount] = useState<number>(
    DEFAULT_QUESTION_COUNT,
  );
  const [timeLimit, setTimeLimit] = useState<number>(DEFAULT_TIME_LIMIT_MINUTES);
  const [difficultyMix, setDifficultyMix] =
    useState<AssignmentDifficultyMix>("any");
  const [dueAt, setDueAt] = useState<string | null>(null);
  // Start time (`opens_at`, NOT NULL DEFAULT now()). Null in the form means
  // "opens immediately" — we omit it on insert and write now() on update.
  const [opensAt, setOpensAt] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  // Empty string = unlimited attempts. We keep it as a string so the input
  // can be cleared without forcing a numeric placeholder.
  const [maxAttempts, setMaxAttempts] = useState<string>("");
  const [latePenaltyPercent, setLatePenaltyPercent] = useState<number>(
    DEFAULT_LATE_PENALTY_PERCENT,
  );
  const [gracePeriodHours, setGracePeriodHours] = useState<number>(
    DEFAULT_GRACE_PERIOD_HOURS,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-field validation state.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<TouchedFields>({});

  // Draft restore banner. `null` = no offer pending; a draft object means we
  // are presenting the user with a Restore/Discard choice.
  const [pendingRestore, setPendingRestore] =
    useState<AssignmentDraft | null>(null);

  // Cancel-confirm inline banner — set when user clicks Cancel with a dirty
  // draft. Shows Discard / Keep editing buttons.
  const [confirmCancel, setConfirmCancel] = useState(false);

  const toast = useToast();

  const titleRef = useRef<HTMLInputElement | null>(null);
  const questionCountRef = useRef<HTMLInputElement | null>(null);
  const timeLimitRef = useRef<HTMLInputElement | null>(null);
  const maxAttemptsRef = useRef<HTMLInputElement | null>(null);
  const latePenaltyRef = useRef<HTMLInputElement | null>(null);
  const graceHoursRef = useRef<HTMLInputElement | null>(null);

  // Debounce timer + latest-state ref for draft writes. We keep a ref to the
  // current form values so the cleanup function (used to flush on unmount)
  // can persist whatever the user typed last without re-running the effect
  // on every keystroke.
  const draftTimerRef = useRef<number | null>(null);
  const latestDraftRef = useRef<AssignmentDraft | null>(null);
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
    let cancelled = false;
    submittedRef.current = false;
    setFieldErrors({});
    setTouched({});
    setConfirmCancel(false);
    setPendingRestore(null);

    if (mode === "edit" && initialAssignment) {
      setTitle(initialAssignment.title);
      setDescription(initialAssignment.description ?? "");
      setSourceId(initialAssignment.source_id);
      setQuestionCount(initialAssignment.question_count);
      setTimeLimit(initialAssignment.time_limit_minutes);
      setDifficultyMix(initialAssignment.difficulty_mix);
      setDueAt(initialAssignment.due_at);
      // A past opens_at = already open = the default state; show empty so
      // the form doesn't nag about a date that no longer matters.
      setOpensAt(
        initialAssignment.opens_at &&
          new Date(initialAssignment.opens_at).getTime() > Date.now()
          ? initialAssignment.opens_at
          : null,
      );
      setArchived(initialAssignment.archived);
      // Reset policy fields to defaults first; we'll overwrite when the
      // direct fetch resolves so the form never shows stale values from a
      // previously-edited assignment.
      setMaxAttempts("");
      setLatePenaltyPercent(DEFAULT_LATE_PENALTY_PERCENT);
      setGracePeriodHours(DEFAULT_GRACE_PERIOD_HOURS);
      // The shared `Assignment` type doesn't yet carry the policy columns
      // (migration 0020), so we fetch them inline here. We swallow errors
      // silently — defaults are a reasonable fallback for the form.
      void (async () => {
        const { data, error: policyError } = await supabase
          .from("assignments")
          .select("max_attempts, late_penalty_percent, grace_period_hours")
          .eq("id", initialAssignment.id)
          .maybeSingle();
        if (cancelled || policyError || !data) return;
        const row = data as unknown as AssignmentPolicyRow;
        setMaxAttempts(
          row.max_attempts === null || row.max_attempts === undefined
            ? ""
            : String(row.max_attempts),
        );
        setLatePenaltyPercent(row.late_penalty_percent ?? 0);
        setGracePeriodHours(row.grace_period_hours ?? 0);
      })();
    } else {
      // Create mode — start with defaults, then offer to restore a draft if
      // one exists for this course.
      setTitle("");
      setDescription("");
      setSourceId("cb");
      setQuestionCount(DEFAULT_QUESTION_COUNT);
      setTimeLimit(DEFAULT_TIME_LIMIT_MINUTES);
      setDifficultyMix("any");
      setDueAt(null);
      setOpensAt(null);
      setArchived(false);
      setMaxAttempts("");
      setLatePenaltyPercent(DEFAULT_LATE_PENALTY_PERCENT);
      setGracePeriodHours(DEFAULT_GRACE_PERIOD_HOURS);
      const draft = readDraft(classId);
      if (draft) setPendingRestore(draft);
    }
    setError(null);
    return () => {
      cancelled = true;
    };
  }, [open, mode, initialAssignment, classId]);

  // ---------------------------------------------------------------------------
  // Live validation: re-validate touched fields whenever their value changes.
  // We deliberately don't surface errors for untouched fields so the form
  // doesn't shout at the user on first open.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setFieldErrors((prev) => {
      const next: FieldErrors = { ...prev };
      if (touched.title) next.title = validateTitle(title);
      if (touched.questionCount)
        next.questionCount = validateQuestionCount(questionCount);
      if (touched.timeLimit) next.timeLimit = validateTimeLimit(timeLimit);
      if (touched.maxAttempts)
        next.maxAttempts = validateMaxAttempts(maxAttempts);
      if (touched.latePenaltyPercent)
        next.latePenaltyPercent = validateLatePenalty(latePenaltyPercent);
      if (touched.gracePeriodHours)
        next.gracePeriodHours = validateGraceHours(gracePeriodHours);
      return next;
    });
  }, [
    title,
    questionCount,
    timeLimit,
    maxAttempts,
    latePenaltyPercent,
    gracePeriodHours,
    touched,
  ]);

  // Whole-form validity (used to gate submit). We compute against the actual
  // values rather than `fieldErrors` so the button reflects validity even for
  // fields the user hasn't touched yet (e.g. they delete the title and tab
  // straight to Save — we still want Save disabled).
  const isValid = useMemo(() => {
    return (
      validateTitle(title) === null &&
      validateQuestionCount(questionCount) === null &&
      validateTimeLimit(timeLimit) === null &&
      validateMaxAttempts(maxAttempts) === null &&
      validateLatePenalty(latePenaltyPercent) === null &&
      validateGraceHours(gracePeriodHours) === null
    );
  }, [title, questionCount, timeLimit, maxAttempts, latePenaltyPercent, gracePeriodHours]);

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
      description.trim().length > 0 ||
      sourceId !== "cb" ||
      questionCount !== DEFAULT_QUESTION_COUNT ||
      timeLimit !== DEFAULT_TIME_LIMIT_MINUTES ||
      difficultyMix !== "any" ||
      dueAt !== null ||
      maxAttempts.trim().length > 0 ||
      latePenaltyPercent !== DEFAULT_LATE_PENALTY_PERCENT ||
      gracePeriodHours !== DEFAULT_GRACE_PERIOD_HOURS
    );
  }, [
    isCreate,
    title,
    description,
    sourceId,
    questionCount,
    timeLimit,
    difficultyMix,
    dueAt,
    maxAttempts,
    latePenaltyPercent,
    gracePeriodHours,
  ]);

  // Debounced draft writer.
  useEffect(() => {
    if (!open || !isCreate) return;
    // Don't overwrite a draft we're actively offering to restore — the user
    // hasn't decided yet whether to keep it.
    if (pendingRestore) return;
    if (!isDirty) return;

    const draft: AssignmentDraft = {
      title,
      description,
      sourceId,
      questionCount,
      timeLimit,
      difficultyMix,
      dueAt,
      maxAttempts,
      latePenaltyPercent,
      gracePeriodHours,
      savedAt: Date.now(),
    };
    latestDraftRef.current = draft;

    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = window.setTimeout(() => {
      writeDraft(classId, draft);
      draftTimerRef.current = null;
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [
    open,
    isCreate,
    pendingRestore,
    isDirty,
    classId,
    title,
    description,
    sourceId,
    questionCount,
    timeLimit,
    difficultyMix,
    dueAt,
    maxAttempts,
    latePenaltyPercent,
    gracePeriodHours,
  ]);

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
        writeDraft(classId, latestDraftRef.current);
      }
    };
    // We intentionally use [] so this only runs on unmount. `classId` is
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
    setDescription(d.description);
    setSourceId(d.sourceId);
    setQuestionCount(d.questionCount);
    setTimeLimit(d.timeLimit);
    setDifficultyMix(d.difficultyMix);
    setDueAt(d.dueAt);
    setMaxAttempts(d.maxAttempts);
    setLatePenaltyPercent(d.latePenaltyPercent);
    setGracePeriodHours(d.gracePeriodHours);
    setPendingRestore(null);
    // The user might immediately tweak something — make sure validation
    // surfaces normally as they go. We do NOT pre-touch all fields here;
    // touching happens on blur as usual.
  }, [pendingRestore]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft(classId);
    latestDraftRef.current = null;
    setPendingRestore(null);
  }, [classId]);

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
    clearDraft(classId);
    latestDraftRef.current = null;
    submittedRef.current = true;
    setConfirmCancel(false);
    onClose();
  }, [classId, onClose]);

  const handleKeepEditing = useCallback(() => {
    setConfirmCancel(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Blur handlers — touch + validate a single field
  // ---------------------------------------------------------------------------
  const markTouched = useCallback((field: FieldKey) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Touch all fields so any lingering errors surface, then short-circuit
    // and focus the first invalid one.
    const allTouched: TouchedFields = {
      title: true,
      questionCount: true,
      timeLimit: true,
      maxAttempts: true,
      latePenaltyPercent: true,
      gracePeriodHours: true,
    };
    setTouched(allTouched);

    const titleErr = validateTitle(title);
    const qcErr = validateQuestionCount(questionCount);
    const tlErr = validateTimeLimit(timeLimit);
    const maErr = validateMaxAttempts(maxAttempts);
    const lpErr = validateLatePenalty(latePenaltyPercent);
    const ghErr = validateGraceHours(gracePeriodHours);
    setFieldErrors({
      title: titleErr,
      questionCount: qcErr,
      timeLimit: tlErr,
      maxAttempts: maErr,
      latePenaltyPercent: lpErr,
      gracePeriodHours: ghErr,
    });

    if (titleErr) {
      titleRef.current?.focus();
      return;
    }
    if (qcErr) {
      questionCountRef.current?.focus();
      return;
    }
    if (tlErr) {
      timeLimitRef.current?.focus();
      return;
    }
    if (maErr) {
      maxAttemptsRef.current?.focus();
      return;
    }
    if (lpErr) {
      latePenaltyRef.current?.focus();
      return;
    }
    if (ghErr) {
      graceHoursRef.current?.focus();
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedMaxAttempts = maxAttempts.trim();
    const maxAttemptsValue: number | null =
      trimmedMaxAttempts.length === 0
        ? null
        : Number.parseInt(trimmedMaxAttempts, 10);

    setBusy(true);
    try {
      const dueAtIso = dueAt;

      if (mode === "edit" && initialAssignment) {
        const { error: updateError } = await supabase
          .from("assignments")
          .update({
            title: trimmedTitle,
            description: description.trim() || null,
            source_id: sourceId,
            question_count: questionCount,
            time_limit_minutes: timeLimit,
            difficulty_mix: difficultyMix,
            due_at: dueAtIso,
            // Cleared picker = opens immediately (column is NOT NULL).
            opens_at: opensAt ?? new Date().toISOString(),
            archived,
            max_attempts: maxAttemptsValue,
            late_penalty_percent: latePenaltyPercent,
            grace_period_hours: gracePeriodHours,
          })
          .eq("id", initialAssignment.id);

        if (updateError) {
          toast.error("Couldn't save", updateError.message);
          return;
        }
        toast.success("Assignment updated");
        onUpdated?.();
        onClose();
        return;
      }

      const { error: insertError } = await supabase.from("assignments").insert({
        course_id: classId,
        created_by: teacherId,
        title: trimmedTitle,
        description: description.trim() || null,
        source_id: sourceId,
        question_count: questionCount,
        time_limit_minutes: timeLimit,
        difficulty_mix: difficultyMix,
        due_at: dueAtIso,
        // Only send when set — the column defaults to now() (opens
        // immediately), and PostgREST passes explicit NULLs through.
        ...(opensAt ? { opens_at: opensAt } : {}),
        max_attempts: maxAttemptsValue,
        late_penalty_percent: latePenaltyPercent,
        grace_period_hours: gracePeriodHours,
      });

      if (insertError) {
        toast.error("Couldn't save", insertError.message);
        return;
      }

      // Server confirmed — now (and only now) it's safe to drop the draft.
      submittedRef.current = true;
      clearDraft(classId);
      latestDraftRef.current = null;

      toast.success("Assignment created");
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      toast.error(
        "Couldn't save",
        getErrorMessage(
          err,
          mode === "edit"
            ? "Failed to update assignment."
            : "Failed to create assignment.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const formId =
    mode === "edit" ? "edit-assignment-form" : "create-assignment-form";
  const headingText =
    mode === "edit" ? "Edit assignment" : "Create an assignment";
  const subheading =
    mode === "edit"
      ? "Update the assignment's settings or archive it."
      : "Configure a test and publish it to your course.";
  const submitLabel = busy
    ? mode === "edit"
      ? "Saving…"
      : "Creating…"
    : mode === "edit"
      ? "Save changes"
      : "Create assignment";

  // Per-field error ids for aria-describedby wiring.
  const titleErrId = "assignment-title-error";
  const qcErrId = "assignment-question-count-error";
  const tlErrId = "assignment-time-limit-error";
  const maErrId = "assignment-max-attempts-error";
  const lpErrId = "assignment-late-penalty-error";
  const ghErrId = "assignment-grace-hours-error";

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title={headingText}
      subtitle={subheading}
      size="lg"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCancelClick}
            className="flex-1 min-h-[40px] rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={busy || !isValid}
            aria-disabled={busy || !isValid}
            title={!isValid && !busy ? "Fix the highlighted fields" : undefined}
            className="flex-1 min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900"
          >
            {submitLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Draft restore banner — create mode only, only when a non-stale
            draft was found on open and the user hasn't decided yet. */}
        {isCreate && pendingRestore && (
          <div
            role="status"
            className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
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
                  className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="rounded-md px-3 py-1 text-xs font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
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
            className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Discard draft and close?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmDiscardAndClose}
                  className="rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleKeepEditing}
                  className="rounded-md px-3 py-1 text-xs font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        )}

        <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
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
              maxLength={MAX_TITLE_LENGTH}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? titleErrId : undefined}
              className={`mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                fieldErrors.title
                  ? "border-rose-400 dark:border-rose-600 focus:ring-rose-500"
                  : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
              }`}
              placeholder="e.g. Unit 3 — Algebra Practice"
            />
            {fieldErrors.title && (
              <span
                id={titleErrId}
                role="alert"
                className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
              >
                {fieldErrors.title}
              </span>
            )}
          </label>

          <div className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Description{" "}
              <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
            </span>
            <div className="mt-1">
              <MarkdownEditor
                value={description}
                onChange={setDescription}
                placeholder="Instructions or context for your students."
                minHeight={120}
                characterLimit={1000}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Question source
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {SOURCE_OPTIONS.map((opt) => {
                const selected = sourceId === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`cursor-pointer rounded-lg ring-1 px-3 py-2 text-sm ${
                      selected
                        ? "bg-indigo-50 dark:bg-indigo-950/40 ring-indigo-400 dark:ring-indigo-500 text-indigo-900 dark:text-indigo-100"
                        : "bg-white dark:bg-slate-800 ring-slate-200 dark:ring-slate-700 text-slate-700 dark:text-slate-300 hover:ring-slate-300 dark:hover:ring-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="source"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setSourceId(opt.value)}
                      className="sr-only"
                    />
                    <span className="block font-medium">{opt.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {opt.hint}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Question count
              </span>
              <input
                ref={questionCountRef}
                type="number"
                min={MIN_QUESTION_COUNT}
                max={MAX_QUESTION_COUNT}
                value={questionCount}
                onChange={(e) =>
                  setQuestionCount(Number.parseInt(e.target.value, 10) || 0)
                }
                onBlur={() => markTouched("questionCount")}
                aria-invalid={Boolean(fieldErrors.questionCount)}
                aria-describedby={
                  fieldErrors.questionCount ? qcErrId : undefined
                }
                className={`mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                  fieldErrors.questionCount
                    ? "border-rose-400 dark:border-rose-600 focus:ring-rose-500"
                    : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                }`}
              />
              {fieldErrors.questionCount ? (
                <span
                  id={qcErrId}
                  role="alert"
                  className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
                >
                  {fieldErrors.questionCount}
                </span>
              ) : (
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  {MIN_QUESTION_COUNT}–{MAX_QUESTION_COUNT}
                </span>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Time limit (minutes)
              </span>
              <input
                ref={timeLimitRef}
                type="number"
                min={0}
                max={300}
                value={timeLimit}
                onChange={(e) =>
                  setTimeLimit(Number.parseInt(e.target.value, 10) || 0)
                }
                onBlur={() => markTouched("timeLimit")}
                aria-invalid={Boolean(fieldErrors.timeLimit)}
                aria-describedby={fieldErrors.timeLimit ? tlErrId : undefined}
                className={`mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                  fieldErrors.timeLimit
                    ? "border-rose-400 dark:border-rose-600 focus:ring-rose-500"
                    : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                }`}
              />
              {fieldErrors.timeLimit ? (
                <span
                  id={tlErrId}
                  role="alert"
                  className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
                >
                  {fieldErrors.timeLimit}
                </span>
              ) : (
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  0 = untimed
                </span>
              )}
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Difficulty mix
            </legend>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              {DIFFICULTY_OPTIONS.map((opt) => {
                const selected = difficultyMix === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`cursor-pointer text-center rounded-lg ring-1 px-3 py-2 text-sm font-medium ${
                      selected
                        ? "bg-indigo-50 dark:bg-indigo-950/40 ring-indigo-400 dark:ring-indigo-500 text-indigo-900 dark:text-indigo-100"
                        : "bg-white dark:bg-slate-800 ring-slate-200 dark:ring-slate-700 text-slate-700 dark:text-slate-300 hover:ring-slate-300 dark:hover:ring-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="difficulty"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setDifficultyMix(opt.value)}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <SmartDatePicker
              label="Opens at (optional — blank = immediately)"
              value={opensAt}
              onChange={setOpensAt}
              allowClear
            />
            <SmartDatePicker
              label="Due date (optional)"
              value={dueAt}
              onChange={setDueAt}
              allowClear
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Max attempts{" "}
                <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
              </span>
              <input
                ref={maxAttemptsRef}
                type="number"
                min={1}
                max={20}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                onBlur={() => markTouched("maxAttempts")}
                placeholder="∞"
                title="Maximum number of times a student may start this assignment. Leave blank for unlimited."
                aria-invalid={Boolean(fieldErrors.maxAttempts)}
                aria-describedby={
                  fieldErrors.maxAttempts ? maErrId : undefined
                }
                className={`mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                  fieldErrors.maxAttempts
                    ? "border-rose-400 dark:border-rose-600 focus:ring-rose-500"
                    : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                }`}
              />
              {fieldErrors.maxAttempts ? (
                <span
                  id={maErrId}
                  role="alert"
                  className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
                >
                  {fieldErrors.maxAttempts}
                </span>
              ) : (
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  Blank = unlimited
                </span>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Late penalty (%)
              </span>
              <input
                ref={latePenaltyRef}
                type="number"
                min={0}
                max={100}
                value={latePenaltyPercent}
                onChange={(e) =>
                  setLatePenaltyPercent(
                    Number.parseInt(e.target.value, 10) || 0,
                  )
                }
                onBlur={() => markTouched("latePenaltyPercent")}
                title="Percentage points subtracted from the score if the attempt is submitted after the due date (plus grace period)."
                aria-invalid={Boolean(fieldErrors.latePenaltyPercent)}
                aria-describedby={
                  fieldErrors.latePenaltyPercent ? lpErrId : undefined
                }
                className={`mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                  fieldErrors.latePenaltyPercent
                    ? "border-rose-400 dark:border-rose-600 focus:ring-rose-500"
                    : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                }`}
              />
              {fieldErrors.latePenaltyPercent ? (
                <span
                  id={lpErrId}
                  role="alert"
                  className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
                >
                  {fieldErrors.latePenaltyPercent}
                </span>
              ) : (
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  0 = no late penalty
                </span>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Grace (hours)
              </span>
              <input
                ref={graceHoursRef}
                type="number"
                min={0}
                max={168}
                value={gracePeriodHours}
                onChange={(e) =>
                  setGracePeriodHours(
                    Number.parseInt(e.target.value, 10) || 0,
                  )
                }
                onBlur={() => markTouched("gracePeriodHours")}
                title="Hours after the due date during which submissions are still considered on-time."
                aria-invalid={Boolean(fieldErrors.gracePeriodHours)}
                aria-describedby={
                  fieldErrors.gracePeriodHours ? ghErrId : undefined
                }
                className={`mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                  fieldErrors.gracePeriodHours
                    ? "border-rose-400 dark:border-rose-600 focus:ring-rose-500"
                    : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                }`}
              />
              {fieldErrors.gracePeriodHours ? (
                <span
                  id={ghErrId}
                  role="alert"
                  className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
                >
                  {fieldErrors.gracePeriodHours}
                </span>
              ) : (
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  Hours past due before penalty applies
                </span>
              )}
            </label>
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
                  Archived assignments stay visible to you (muted) and to
                  students who already started — but new attempts are blocked.
                </span>
              </span>
            </label>
          )}
        </form>
      </div>
    </ResponsiveModal>
  );
}

// Backward-compat alias.
type CreateAssignmentModalCompatProps = Omit<
  AssignmentFormModalProps,
  "mode" | "initialAssignment" | "onUpdated"
>;
export function CreateAssignmentModal(props: CreateAssignmentModalCompatProps) {
  return <AssignmentFormModal {...props} mode="create" />;
}
