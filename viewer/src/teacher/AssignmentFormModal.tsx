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
 * Backward compatibility: the legacy export name `CreateAssignmentModal` is
 * kept so existing call-sites keep working.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  Assignment,
  AssignmentDifficultyMix,
  AssignmentSourceId,
} from "./useAssignments";
import { SmartDatePicker, useToast } from "@/components";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useFocusTrap } from "../hooks";

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

interface SourceOption {
  value: AssignmentSourceId;
  label: string;
  hint: string;
}

interface DifficultyOption {
  value: AssignmentDifficultyMix;
  label: string;
}

const SOURCE_OPTIONS: SourceOption[] = [
  { value: "cb", label: "CB Question Bank", hint: "Official CB items" },
  { value: "sat", label: "SAT Factory", hint: "Practice SAT items" },
  { value: "mixed", label: "Mixed", hint: "Both pools" },
];

const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  { value: "any", label: "Any" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const MIN_QUESTION_COUNT = 5;
const MAX_QUESTION_COUNT = 50;
const DEFAULT_QUESTION_COUNT = 22;
const DEFAULT_TIME_LIMIT_MINUTES = 30;
const DEFAULT_LATE_PENALTY_PERCENT = 0;
const DEFAULT_GRACE_PERIOD_HOURS = 0;

/** Shape of the multi-attempt / late-policy columns added in migration 0020.
    We fetch these directly inside the modal so we don't have to widen the
    shared Assignment type (and the rest of the app) before they're rolled out
    end-to-end. */
interface AssignmentPolicyRow {
  max_attempts: number | null;
  late_penalty_percent: number | null;
  grace_period_hours: number | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
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
  const toast = useToast();

  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (mode === "edit" && initialAssignment) {
      setTitle(initialAssignment.title);
      setDescription(initialAssignment.description ?? "");
      setSourceId(initialAssignment.source_id);
      setQuestionCount(initialAssignment.question_count);
      setTimeLimit(initialAssignment.time_limit_minutes);
      setDifficultyMix(initialAssignment.difficulty_mix);
      setDueAt(initialAssignment.due_at);
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
      setTitle("");
      setDescription("");
      setSourceId("cb");
      setQuestionCount(DEFAULT_QUESTION_COUNT);
      setTimeLimit(DEFAULT_TIME_LIMIT_MINUTES);
      setDifficultyMix("any");
      setDueAt(null);
      setArchived(false);
      setMaxAttempts("");
      setLatePenaltyPercent(DEFAULT_LATE_PENALTY_PERCENT);
      setGracePeriodHours(DEFAULT_GRACE_PERIOD_HOURS);
    }
    setError(null);
    const id = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [open, mode, initialAssignment]);

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
    if (!trimmedTitle) {
      setError("Please enter an assignment title.");
      return;
    }
    if (
      questionCount < MIN_QUESTION_COUNT ||
      questionCount > MAX_QUESTION_COUNT
    ) {
      setError(
        `Question count must be between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}.`,
      );
      return;
    }
    if (timeLimit < 0) {
      setError("Time limit must be 0 or a positive number of minutes.");
      return;
    }

    // Parse + validate the new policy fields. `maxAttempts` is optional:
    // empty string means unlimited (NULL in the DB).
    const trimmedMaxAttempts = maxAttempts.trim();
    let maxAttemptsValue: number | null = null;
    if (trimmedMaxAttempts.length > 0) {
      const parsed = Number.parseInt(trimmedMaxAttempts, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        setError("Max attempts must be 1 or higher (leave blank for unlimited).");
        return;
      }
      maxAttemptsValue = parsed;
    }
    if (
      !Number.isFinite(latePenaltyPercent) ||
      latePenaltyPercent < 0 ||
      latePenaltyPercent > 100
    ) {
      setError("Late penalty must be between 0 and 100.");
      return;
    }
    if (!Number.isFinite(gracePeriodHours) || gracePeriodHours < 0) {
      setError("Grace period must be 0 or a positive number of hours.");
      return;
    }

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
        max_attempts: maxAttemptsValue,
        late_penalty_percent: latePenaltyPercent,
        grace_period_hours: gracePeriodHours,
      });

      if (insertError) {
        toast.error("Couldn't save", insertError.message);
        return;
      }

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

  const titleId =
    mode === "edit" ? "edit-assignment-title" : "create-assignment-title";
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
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Unit 3 — Algebra Practice"
            />
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
                type="number"
                min={MIN_QUESTION_COUNT}
                max={MAX_QUESTION_COUNT}
                value={questionCount}
                onChange={(e) =>
                  setQuestionCount(Number.parseInt(e.target.value, 10) || 0)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                {MIN_QUESTION_COUNT}–{MAX_QUESTION_COUNT}
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Time limit (minutes)
              </span>
              <input
                type="number"
                min={0}
                max={300}
                value={timeLimit}
                onChange={(e) =>
                  setTimeLimit(Number.parseInt(e.target.value, 10) || 0)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                0 = untimed
              </span>
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

          <SmartDatePicker
            label="Due date (optional)"
            value={dueAt}
            onChange={setDueAt}
            allowClear
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Max attempts{" "}
                <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                placeholder="∞"
                title="Maximum number of times a student may start this assignment. Leave blank for unlimited."
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                Blank = unlimited
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Late penalty (%)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={latePenaltyPercent}
                onChange={(e) =>
                  setLatePenaltyPercent(
                    Number.parseInt(e.target.value, 10) || 0,
                  )
                }
                title="Percentage points subtracted from the score if the attempt is submitted after the due date (plus grace period)."
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                0 = no late penalty
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Grace (hours)
              </span>
              <input
                type="number"
                min={0}
                max={168}
                value={gracePeriodHours}
                onChange={(e) =>
                  setGracePeriodHours(
                    Number.parseInt(e.target.value, 10) || 0,
                  )
                }
                title="Hours after the due date during which submissions are still considered on-time."
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                Hours past due before penalty applies
              </span>
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

// Backward-compat alias.
type CreateAssignmentModalCompatProps = Omit<
  AssignmentFormModalProps,
  "mode" | "initialAssignment" | "onUpdated"
>;
export function CreateAssignmentModal(props: CreateAssignmentModalCompatProps) {
  return <AssignmentFormModal {...props} mode="create" />;
}
