/**
 * AddSetToCourseModal
 * ===================
 * Modal for assigning a pre-built CB question set (from the global
 * question bank catalog) to one of the teacher's own courses. Distinct
 * from `AssignmentFormModal` because:
 *
 *   - The teacher first has to pick *which* course (this is the
 *     entry-point to the assignments table from a global surface).
 *   - The source pool / difficulty / question count are fixed by the
 *     catalog entry itself — we don't expose them as editable fields.
 *   - We insert a `qbank_set` row (migration 0042's new `kind` value)
 *     instead of the generic `cb / sat / mixed` source assignment.
 *
 * The course picker uses the existing `useTeacherClasses` hook so a
 * teacher can only assign sets into their own courses. Archived courses
 * are filtered out — assigning into an archive is almost always a bug.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MarkdownEditor, SmartDatePicker, useToast } from "@/components";
import { useTeacherClasses } from "./useTeacherClasses";
import { useFocusTrap } from "@/hooks";
import {
  catalogEntryUid,
  type CatalogEntry,
} from "./useQuestionBankCatalog";

interface AddSetToCourseModalProps {
  open: boolean;
  entry: CatalogEntry | null;
  teacherId: string;
  /** Optional pre-selected course (e.g. when launched from a course page). */
  initialCourseId?: string | null;
  onClose: () => void;
  onAdded?: () => void;
}

/**
 * Compute a sensible default time limit from the catalog entry's question
 * count: ~45 sec/question (0.75 min) with safety margin, rounded up to the
 * nearest 5 minutes, with a 10-minute floor.
 *
 * Why compute instead of asking the teacher? Per the project's "library
 * authoring vs assigning" principle (see CLAUDE.md + the May-2026 workflow
 * audit), assign-time forms should only vary (which thing, due date,
 * display title). Time limit is intrinsic to the question set and belongs
 * to the catalog entry's definition. catalog.json doesn't carry a
 * `time_limit_minutes` field today; until it does, this heuristic gives
 * the teacher a reasonable starting time without making them author it.
 */
function computeDefaultTimeLimit(questionCount: number): number {
  if (!Number.isFinite(questionCount) || questionCount <= 0) return 10;
  const raw = questionCount * 0.75;
  const rounded = Math.ceil(raw / 5) * 5;
  return Math.max(10, rounded);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function AddSetToCourseModal({
  open,
  entry,
  teacherId,
  initialCourseId,
  onClose,
  onAdded,
}: AddSetToCourseModalProps): JSX.Element | null {
  const toast = useToast();
  const { classes, loading: classesLoading } = useTeacherClasses(
    open ? teacherId : null,
  );

  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  // Eligible courses for the picker — exclude archived to discourage
  // assigning into stale courses. Templates are still allowed because a
  // teacher may legitimately want to pre-stage a template course.
  const eligibleCourses = useMemo(
    () => classes.filter((c) => !c.archived),
    [classes],
  );

  // Reset form whenever the modal opens with a (possibly new) entry.
  useEffect(() => {
    if (!open || !entry) return;
    setTitle(entry.label);
    setDescription("");
    setDueAt(null);
    setError(null);
    setSelectedCourseId(initialCourseId ?? "");
    const id = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, entry, initialCourseId]);

  // If a single eligible course is available and nothing is picked yet,
  // pre-select it. Saves a click in the common single-course case.
  useEffect(() => {
    if (!open) return;
    if (selectedCourseId) return;
    if (eligibleCourses.length === 1) {
      setSelectedCourseId(eligibleCourses[0].id);
    }
  }, [open, eligibleCourses, selectedCourseId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !entry) return null;

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Please enter a title for this assignment.");
      return;
    }
    if (!selectedCourseId) {
      setError("Please pick a course to add this set to.");
      return;
    }

    setBusy(true);
    try {
      const uid = catalogEntryUid(entry);
      const nowIso = new Date().toISOString();
      const { error: insertError } = await supabase
        .from("assignments")
        .insert({
          course_id: selectedCourseId,
          created_by: teacherId,
          title: trimmedTitle,
          description: description.trim() || null,
          // Migration 0042 introduces `kind` + `qbank_set_*` columns and
          // makes `source_id` nullable for qbank-sourced rows.
          source_id: null,
          kind: "qbank_set",
          qbank_set_uid: uid,
          qbank_set_label: entry.label,
          question_count: entry.questionCount,
          // Time limit is intrinsic to the question set — heuristic until
          // catalog.json adds an explicit `time_limit_minutes` field.
          time_limit_minutes: computeDefaultTimeLimit(entry.questionCount),
          // Pre-built sets carry their own difficulty mix; "any" is the
          // neutral marker we use to mean "trust the source set".
          difficulty_mix: "any",
          due_at: dueAt,
          opens_at: nowIso,
          archived: false,
          // NULL = unlimited attempts. Per workflow audit: per-assignment
          // override belongs on the assignment page, not the catalog
          // assign-to-course form.
          max_attempts: null,
        });

      if (insertError) {
        toast.error("Couldn't add to course", insertError.message);
        return;
      }

      const courseName =
        eligibleCourses.find((c) => c.id === selectedCourseId)?.name ??
        "your course";
      toast.success("Assignment created", `Added to ${courseName}.`);
      onAdded?.();
      onClose();
    } catch (err: unknown) {
      toast.error(
        "Couldn't add to course",
        getErrorMessage(err, "Failed to add set to course."),
      );
    } finally {
      setBusy(false);
    }
  };

  const titleId = "add-set-to-course-title";
  const submitLabel = busy ? "Adding…" : "Add to course";

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
              Add to course
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Assigns{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {entry.label}
              </span>{" "}
              ({entry.questionCount} question{entry.questionCount === 1 ? "" : "s"}) to one of your courses.
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
              Course
            </span>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              disabled={classesLoading}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            >
              <option value="">
                {classesLoading
                  ? "Loading courses…"
                  : eligibleCourses.length === 0
                    ? "No active courses — create one first"
                    : "Select a course…"}
              </option>
              {eligibleCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

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
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Description{" "}
              <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
            </span>
            <div className="mt-1">
              <MarkdownEditor
                value={description}
                onChange={setDescription}
                placeholder="Instructions or context for your students."
                minHeight={96}
                characterLimit={1000}
              />
            </div>
          </label>

          <SmartDatePicker
            label="Due date (optional)"
            value={dueAt}
            onChange={setDueAt}
            allowClear
          />

          {/* Read-only meta line — these properties are intrinsic to the
              question set and shouldn't be edited at assign-time. To change
              them the teacher edits the catalog entry (future feature). */}
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700"
            aria-label="Set defaults"
          >
            <span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                ~{computeDefaultTimeLimit(entry.questionCount)} min
              </span>{" "}
              suggested
            </span>
            <span className="text-slate-400">·</span>
            <span>unlimited attempts</span>
            <span className="text-slate-400">·</span>
            <span>
              {entry.questionCount} question
              {entry.questionCount === 1 ? "" : "s"}
            </span>
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
              disabled={busy || eligibleCourses.length === 0}
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
