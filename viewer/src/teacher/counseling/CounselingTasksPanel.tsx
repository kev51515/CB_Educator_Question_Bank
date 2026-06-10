/**
 * CounselingTasksPanel
 * ====================
 * Counselor-facing task list for a single (course, student) pair. The signed-in
 * viewer is the COUNSELOR; row-level security on `counseling_tasks` enforces
 * that they can only read/write tasks for students they counsel — this
 * component does no client-side gating beyond what RLS already guarantees.
 *
 * Each task is a checkbox-toggle between 'open' and 'done', an inline add form,
 * and a destructive remove (ConfirmDialog). Open tasks sort first, then by due
 * date ascending (nulls last). A past-due open task gets a rose "Overdue" chip.
 *
 * Enhancements (additive): a row of one-click "Quick add" template chips that
 * pre-fill the add-form title (the counselor still picks a due date + submits),
 * a "N of M done" progress summary with a thin completion bar, and a
 * collapsible "Done (k)" section so the working set (open tasks) stays at the
 * top while completed history is tucked away but reachable.
 *
 * Conventions copied from CourseSharingControls.tsx: `@/lib/supabase`,
 * `useToast`, the `aliveRef` mounted-guard for every setState-after-await, and
 * slate/indigo dark-mode Tailwind cards.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast, StarRating } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  fetchGradingSettings,
  gradeState,
  type GradingSettings,
  type GradableTask,
} from "./grading";

/**
 * A counseling task row including the star-grading columns (migration 0140).
 * A SELECT of "*" returns them, so the existing single query already loads
 * everything; we just widen the type so the grading UI is type-safe.
 */
interface CounselingTask extends GradableTask {
  course_id: string;
  student_id: string;
  title: string;
  details: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Map a grade-RPC error code to a friendly toast message. */
function friendlyGradeError(message: string): string {
  switch (message) {
    case "not_submitted":
      return "The student hasn't submitted this task yet.";
    case "invalid_quality":
      return "That star rating is out of range for this course.";
    case "not_authorized":
      return "You're not allowed to grade this task.";
    default:
      return message;
  }
}

interface Props {
  courseId: string;
  studentId: string;
}

/**
 * Common college-counseling task titles offered as one-click "Quick add" chips.
 * Plain strings (no DB) — clicking one pre-fills the add-form title so the
 * counselor only has to pick a due date and submit.
 */
const TASK_TEMPLATES: readonly string[] = [
  "Finalize college list",
  "Request recommendation letters",
  "Draft personal statement",
  "Complete Common App profile",
  "Register for SAT/ACT",
  "Submit FAFSA",
  "Request transcripts",
  "Write supplemental essays",
] as const;

/** Today as a YYYY-MM-DD string (local), for comparing against `due_date`. */
function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Human-friendly due-date label, e.g. "Due Mar 14, 2026". */
function formatDue(due: string): string {
  // due is a YYYY-MM-DD date string; parse as local midnight to avoid TZ drift.
  const [y, m, d] = due.split("-").map((n) => Number(n));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CounselingTasksPanel({ courseId, studentId }: Props) {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [tasks, setTasks] = useState<CounselingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTask, setConfirmTask] = useState<CounselingTask | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  // Star-grading settings for this course (falls back to defaults if no row).
  const [settings, setSettings] = useState<GradingSettings | null>(null);

  // Per-task in-progress grading state, keyed by task id. `quality` is the
  // QUALITY star count (0..quality_max) the counselor is about to save;
  // `feedback` is the editable feedback draft. Seeded lazily from the row.
  const [quality, setQuality] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  // Which task's grade is currently being saved / whose gradable toggle is busy.
  const [gradeBusyId, setGradeBusyId] = useState<string | null>(null);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  // Add-form state.
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const [adding, setAdding] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Whether the collapsible "Done (k)" section is expanded.
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const { data, error } = await supabase
      .from("counseling_tasks")
      .select("*")
      .eq("course_id", courseId)
      .eq("student_id", studentId)
      .order("status")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (!aliveRef.current) return;
    if (error) {
      setTasks([]);
      setLoading(false);
      toast.error("Couldn't load tasks", error.message);
      return;
    }
    setTasks((data ?? []) as CounselingTask[]);
    setLoading(false);
  }, [courseId, studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load this course's grading settings once per course (defaults if no row).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const s = await fetchGradingSettings(courseId);
      if (!alive || !aliveRef.current) return;
      setSettings(s);
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  const today = todayISODate();

  // Sort by due_date ascending (nulls last) within a status group. Defensive
  // client-side sort mirrors the query order so refetches always render stably.
  const byDueDate = useCallback(
    (a: CounselingTask, b: CounselingTask): number => {
      const ad = a.due_date;
      const bd = b.due_date;
      if (ad === bd) return 0;
      if (ad === null) return 1;
      if (bd === null) return -1;
      return ad < bd ? -1 : 1;
    },
    [],
  );

  // Split into open (working set, shown first) and done (collapsible history).
  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "open").sort(byDueDate),
    [tasks, byDueDate],
  );
  const doneTasks = useMemo(
    () => tasks.filter((t) => t.status === "done").sort(byDueDate),
    [tasks, byDueDate],
  );

  // Progress summary across all tasks.
  const total = tasks.length;
  const doneCount = doneTasks.length;
  const pctDone = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  /**
   * Quick-add: pre-fill the add-form title from a template chip, then focus the
   * title input so the counselor can tab to the due date and submit. Purely a
   * convenience on top of the existing add form — no write happens here.
   */
  const applyTemplate = (title: string): void => {
    setNewTitle(title);
    // Focus after the controlled value updates so the cursor lands ready to edit.
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const onToggle = async (task: CounselingTask): Promise<void> => {
    setBusyId(task.id);
    const next =
      task.status === "open"
        ? { status: "done" as const, completed_at: new Date().toISOString() }
        : { status: "open" as const, completed_at: null };
    const { error } = await supabase
      .from("counseling_tasks")
      .update(next)
      .eq("id", task.id);
    if (!aliveRef.current) return;
    setBusyId(null);
    if (error) {
      toast.error("Couldn't update task", error.message);
      return;
    }
    toast.success(
      next.status === "done"
        ? `Marked "${task.title}" done`
        : `Reopened "${task.title}"`,
    );
    void load();
  };

  const onAdd = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      toast.error("A title is required");
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("counseling_tasks").insert({
      course_id: courseId,
      student_id: studentId,
      title,
      details: newDetails.trim() || null,
      due_date: newDue || null,
      status: "open",
    });
    if (!aliveRef.current) return;
    setAdding(false);
    if (error) {
      toast.error("Couldn't add task", error.message);
      return;
    }
    setNewTitle("");
    setNewDue("");
    setNewDetails("");
    toast.success("Task added");
    void load();
  };

  const onConfirmRemove = async (): Promise<void> => {
    if (!confirmTask) return;
    setRemoveBusy(true);
    const { error } = await supabase
      .from("counseling_tasks")
      .delete()
      .eq("id", confirmTask.id);
    if (!aliveRef.current) return;
    setRemoveBusy(false);
    if (error) {
      toast.error("Couldn't remove task", error.message);
      return;
    }
    setConfirmTask(null);
    toast.success("Task removed");
    void load();
  };

  /** Save a counselor grade for a (submitted) task via grade_counseling_task. */
  const onSaveGrade = async (task: CounselingTask): Promise<void> => {
    const qMax = settings?.quality_max_stars ?? 0;
    const q = Math.min(
      quality[task.id] ?? task.quality_stars ?? 0,
      qMax,
    );
    const fb = (feedback[task.id] ?? task.feedback ?? "").trim();
    setGradeBusyId(task.id);
    const { error } = await supabase.rpc("grade_counseling_task", {
      p_task_id: task.id,
      p_quality_stars: q,
      p_feedback: fb || null,
    });
    if (!aliveRef.current) return;
    setGradeBusyId(null);
    if (error) {
      toast.error("Couldn't save grade", friendlyGradeError(error.message));
      return;
    }
    // Drop the local draft so the control reflects the saved row (and, after a
    // later resubmit clears the grade, doesn't pre-seed the old quality/feedback).
    setQuality((prev) => {
      const n = { ...prev };
      delete n[task.id];
      return n;
    });
    setFeedback((prev) => {
      const n = { ...prev };
      delete n[task.id];
      return n;
    });
    toast.success(`Graded "${task.title}"`);
    void load();
  };

  /** Flip a task's `gradable` flag directly (counselor RLS allows the update). */
  const onToggleGradable = async (task: CounselingTask): Promise<void> => {
    const next = !task.gradable;
    setToggleBusyId(task.id);
    const { error } = await supabase
      .from("counseling_tasks")
      .update({ gradable: next })
      .eq("id", task.id);
    if (!aliveRef.current) return;
    setToggleBusyId(null);
    if (error) {
      toast.error("Couldn't update task", error.message);
      return;
    }
    toast.success(
      next
        ? `"${task.title}" is now a graded deliverable`
        : `"${task.title}" reverted to a plain task`,
    );
    void load();
  };

  /**
   * The star-grading area for a single gradable task. Only rendered when
   * settings.enabled && task.gradable. Mirrors the lifecycle contract:
   *   not_submitted  -> "Awaiting submission" hint (the student submits).
   *   awaiting_grade -> provisional punctuality stars + a grading control.
   *   graded         -> current stars + feedback + re-grade control.
   */
  const renderGradingArea = (task: CounselingTask): JSX.Element | null => {
    if (!settings) return null;
    const state = gradeState(task);
    const maxStars = settings.max_stars;
    const punctuality = task.punctuality_stars ?? 0;
    const onTime = task.submission_on_time;

    const stateChip = (
      <span
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${
          state === "graded"
            ? "bg-emerald-50 dark:bg-emerald-950/40 ring-emerald-300 dark:ring-emerald-800 text-emerald-700 dark:text-emerald-300"
            : state === "awaiting_grade"
              ? "bg-amber-50 dark:bg-amber-950/40 ring-amber-300 dark:ring-amber-800 text-amber-700 dark:text-amber-300"
              : "bg-slate-50 dark:bg-slate-800 ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300"
        }`}
      >
        {state === "graded"
          ? "Graded"
          : state === "awaiting_grade"
            ? "Awaiting grade"
            : "Not submitted"}
      </span>
    );

    const punctualityChip =
      state !== "not_submitted" && onTime !== null ? (
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${
            onTime
              ? "bg-emerald-50 dark:bg-emerald-950/40 ring-emerald-300 dark:ring-emerald-800 text-emerald-700 dark:text-emerald-300"
              : "bg-rose-50 dark:bg-rose-950/40 ring-rose-300 dark:ring-rose-800 text-rose-700 dark:text-rose-300"
          }`}
        >
          {onTime ? "On time" : "Late"}
        </span>
      ) : null;

    return (
      <div className="mt-2 space-y-2 rounded-lg ring-1 ring-amber-200/70 dark:ring-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {stateChip}
          {punctualityChip}
        </div>

        {state === "not_submitted" ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Awaiting submission — the student earns punctuality stars when they
            submit.
          </p>
        ) : (
          <div className="space-y-2">
            {state === "graded" && (
              <StarRating
                value={task.stars ?? 0}
                lockedCount={punctuality}
                max={maxStars}
                size="sm"
                label={`${task.stars ?? 0} of ${maxStars} stars`}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const draftQuality = quality[task.id] ?? task.quality_stars ?? 0;
                // Never render past the cap (e.g. if a settings change shrank
                // max_stars below an old punctuality+quality sum) — the DB also
                // clamps on save, but the control must agree with the label.
                const displayStars = Math.min(
                  punctuality + draftQuality,
                  maxStars,
                );
                return (
                  <>
                    <StarRating
                      interactive
                      lockedCount={punctuality}
                      value={displayStars}
                      max={maxStars}
                      size="md"
                      onChange={(q) =>
                        setQuality((prev) => ({ ...prev, [task.id]: q }))
                      }
                    />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {displayStars} of {maxStars} stars
                    </span>
                  </>
                );
              })()}
            </div>
            <textarea
              value={feedback[task.id] ?? task.feedback ?? ""}
              onChange={(e) =>
                setFeedback((prev) => ({ ...prev, [task.id]: e.target.value }))
              }
              placeholder="Feedback for the student (optional)…"
              aria-label={`Feedback for "${task.title}"`}
              rows={2}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              disabled={gradeBusyId === task.id}
              onClick={() => {
                void onSaveGrade(task);
              }}
              className="min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gradeBusyId === task.id
                ? "Saving…"
                : state === "graded"
                  ? "Update grade"
                  : "Save grade"}
            </button>
          </div>
        )}
      </div>
    );
  };

  /** One task row, shared by the open + done groups. */
  const renderTaskRow = (task: CounselingTask): JSX.Element => {
    const done = task.status === "done";
    const overdue = !done && task.due_date !== null && task.due_date < today;
    // Show the grading area only when this course has grading on AND this task
    // is flagged as a graded deliverable. Otherwise it's a plain open/done task.
    const showGrading = !!settings?.enabled && task.gradable;
    // The gradable toggle is offered whenever the course has grading enabled.
    const showGradableToggle = !!settings?.enabled;
    return (
      <li
        key={task.id}
        className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5"
      >
        <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={
            done ? `Mark "${task.title}" open` : `Mark "${task.title}" done`
          }
          disabled={busyId === task.id}
          onClick={() => {
            void onToggle(task);
          }}
          className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 disabled:opacity-50 ${
            done
              ? "bg-indigo-600 ring-indigo-600 text-white hover:bg-indigo-700"
              : "bg-white dark:bg-slate-950 ring-slate-300 dark:ring-slate-700 text-transparent hover:ring-indigo-500"
          }`}
        >
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-bold ${
              done
                ? "line-through text-slate-400 dark:text-slate-500"
                : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {task.title}
          </p>
          {task.details && (
            <p
              className={`mt-0.5 text-xs ${
                done
                  ? "text-slate-400 dark:text-slate-600"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {task.details}
            </p>
          )}
          {task.due_date && (
            <span
              className={`mt-1.5 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${
                overdue
                  ? "bg-rose-50 dark:bg-rose-950/40 ring-rose-300 dark:ring-rose-800 text-rose-700 dark:text-rose-300"
                  : "bg-slate-50 dark:bg-slate-800 ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300"
              }`}
            >
              {overdue ? "Overdue · " : ""}
              {formatDue(task.due_date)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setConfirmTask(task)}
          className="mt-0.5 shrink-0 inline-flex min-h-[40px] items-center rounded-md ring-1 ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
        >
          Remove
        </button>
        </div>

        {/* Gradable toggle — only when this course has star grading enabled. */}
        {showGradableToggle && (
          <div className="mt-2 flex items-center justify-end">
            <button
              type="button"
              role="switch"
              aria-checked={task.gradable}
              aria-label={
                task.gradable
                  ? `Stop grading "${task.title}"`
                  : `Make "${task.title}" a graded deliverable`
              }
              disabled={toggleBusyId === task.id}
              onClick={() => {
                void onToggleGradable(task);
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-50"
            >
              <span>Gradable</span>
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  task.gradable
                    ? "bg-indigo-600"
                    : "bg-slate-300 dark:bg-slate-700"
                }`}
                aria-hidden
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    task.gradable ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
        )}

        {/* Star-grading area for a graded deliverable. */}
        {showGrading && renderGradingArea(task)}
      </li>
    );
  };

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          Tasks
        </h3>
        {!loading && total > 0 && (
          <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
            {doneCount} of {total} done
          </span>
        )}
      </div>

      {/* Subtle hint when star grading is off for this course. */}
      {!loading && settings && !settings.enabled && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Star grading is off for this course — turn it on in Course Settings to
          grade deliverables.
        </p>
      )}

      {/* Progress bar — visible whenever there's at least one task. */}
      {!loading && total > 0 && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pctDone}
          aria-label={`${doneCount} of ${total} tasks done`}
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${pctDone}%` }}
          />
        </div>
      )}

      {loading ? (
        <SkeletonRows count={3} />
      ) : total === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No tasks yet — use a Quick add chip or the form below to start tracking
          this student's counseling follow-ups.
        </p>
      ) : (
        <div className="space-y-3">
          {openTasks.length > 0 ? (
            <ul className="space-y-2">{openTasks.map(renderTaskRow)}</ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              All tasks complete. Add another below or reopen one from Done.
            </p>
          )}

          {doneTasks.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className={`transition-transform ${showDone ? "rotate-90" : ""}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Done ({doneCount})
              </button>
              {showDone && (
                <ul className="space-y-2">{doneTasks.map(renderTaskRow)}</ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick add — one-click template chips that pre-fill the form title. */}
      {!loading && (
        <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Quick add
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TASK_TEMPLATES.map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => applyTemplate(title)}
                className="inline-flex min-h-[40px] items-center rounded-full ring-1 ring-slate-300 dark:ring-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:ring-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                {title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add a task */}
      <form onSubmit={onAdd} className="space-y-2 pt-2">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Add a task
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={titleInputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title…"
            aria-label="Task title"
            required
            className="min-h-[44px] flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            aria-label="Due date (optional)"
            className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <input
          type="text"
          value={newDetails}
          onChange={(e) => setNewDetails(e.target.value)}
          placeholder="Details (optional)…"
          aria-label="Task details (optional)"
          className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add task"}
        </button>
      </form>

      {confirmTask && (
        <ConfirmDialog
          title="Remove task"
          body={
            <>
              Remove{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {confirmTask.title}
              </span>
              ? This can't be undone.
            </>
          }
          confirmLabel="Remove"
          destructive
          busy={removeBusy}
          onConfirm={() => {
            void onConfirmRemove();
          }}
          onCancel={() => setConfirmTask(null)}
        />
      )}
    </section>
  );
}
