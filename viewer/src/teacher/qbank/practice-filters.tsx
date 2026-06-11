/**
 * qbank/practice-filters
 * ======================
 * Practice-Test filter state + persistence, the <PracticeFilterPill>, the
 * <CoursePickerDialog>, and pure helpers (readPracticeFilter / writePracticeFilter
 * / formatRelativeDue / PRACTICE_SOURCE_LABEL). Extracted verbatim from
 * QuestionBankPage; consumed by practice-section + the page via the barrel.
 */
import { useEffect, useState } from "react";
import { Combobox, SkeletonRows } from "@/components";
import { type AssignmentSourceId } from "@/teacher/useAssignments";
export type PracticeSourceFilter = AssignmentSourceId | "all";
export type PracticeStatusFilter = "active" | "archived";

export interface PracticeFilterState {
  courseId: string | "all";
  source: PracticeSourceFilter;
  status: PracticeStatusFilter;
}

export const PRACTICE_FILTER_STORAGE_KEY = "qbank.practiceTests.filter";

export const DEFAULT_PRACTICE_FILTER: PracticeFilterState = {
  courseId: "all",
  source: "all",
  status: "active",
};

export const PRACTICE_SOURCE_LABEL: Record<AssignmentSourceId, string> = {
  cb: "CB",
  sat: "SAT",
  mixed: "Mixed",
};

export function readPracticeFilter(): PracticeFilterState {
  if (typeof window === "undefined") return DEFAULT_PRACTICE_FILTER;
  try {
    const raw = window.localStorage.getItem(PRACTICE_FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_PRACTICE_FILTER;
    const parsed = JSON.parse(raw) as Partial<PracticeFilterState>;
    const status: PracticeStatusFilter =
      parsed.status === "archived" ? "archived" : "active";
    const source: PracticeSourceFilter =
      parsed.source === "cb" ||
      parsed.source === "sat" ||
      parsed.source === "mixed"
        ? parsed.source
        : "all";
    const courseId =
      typeof parsed.courseId === "string" && parsed.courseId.length > 0
        ? parsed.courseId
        : "all";
    return { courseId, source, status };
  } catch {
    return DEFAULT_PRACTICE_FILTER;
  }
}

export function writePracticeFilter(value: PracticeFilterState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PRACTICE_FILTER_STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

export function formatRelativeDue(iso: string | null): string {
  if (!iso) return "No due date";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "No due date";
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.round(diffMs / dayMs);
  if (diffDays === 0) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Due now";
    if (diffHours > 0) return `Due in ${diffHours}h`;
    return `Due ${Math.abs(diffHours)}h ago`;
  }
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays === -1) return "Due yesterday";
  if (diffDays > 1) return `Due in ${diffDays} days`;
  return `Due ${Math.abs(diffDays)} days ago`;
}

export interface PracticeFilterPillProps {
  active: boolean;
  label: string;
  onClick: () => void;
  count?: number;
}

export function PracticeFilterPill({
  active,
  label,
  onClick,
  count,
}: PracticeFilterPillProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full min-h-[40px] md:min-h-0 px-3 py-2 md:py-1 text-xs font-medium ring-1 transition ${
        active
          ? "bg-indigo-600 text-white ring-indigo-600"
          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={`inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
            active
              ? "bg-white/20 text-white"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export interface CoursePickerDialogProps {
  open: boolean;
  courses: { id: string; name: string }[];
  loading: boolean;
  onCancel: () => void;
  onPick: (courseId: string) => void;
}

/**
 * Lightweight course picker shown when a teacher hits "+ Practice Test"
 * from the global catalog. The existing AssignmentFormModal requires a
 * `classId`, so we pre-flight by asking which course this practice test
 * lives in, then hand off to the standard create flow.
 *
 * Kept inline (not a full modal) — the form has a single field, so a
 * dedicated component file would be overkill.
 */
export function CoursePickerDialog({
  open,
  courses,
  loading,
  onCancel,
  onPick,
}: CoursePickerDialogProps): JSX.Element | null {
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (open) setSelected("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a course"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Pick a course
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Practice tests are assigned to a single course. Pick which one this
            test lives in.
          </p>
        </header>

        {loading ? (
          <SkeletonRows count={2} rowClassName="h-10 rounded-md" />
        ) : courses.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You don't have any active courses yet. Create a course first.
          </p>
        ) : (
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Course
            </span>
            <Combobox
              value={selected.length > 0 ? selected : null}
              onChange={(v) => setSelected(v)}
              options={courses.map((c) => ({ value: c.id, label: c.name }))}
              ariaLabel="Course"
              placeholder="Choose a course…"
              className="mt-1 w-full"
            />
          </label>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => onPick(selected)}
            className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
