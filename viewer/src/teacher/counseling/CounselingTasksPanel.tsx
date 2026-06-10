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
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDialog } from "../ConfirmDialog";

interface CounselingTask {
  id: string;
  course_id: string;
  student_id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  status: "open" | "done";
  completed_at: string | null;
  created_at: string;
  updated_at: string;
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

  /** One task row, shared by the open + done groups. */
  const renderTaskRow = (task: CounselingTask): JSX.Element => {
    const done = task.status === "done";
    const overdue = !done && task.due_date !== null && task.due_date < today;
    return (
      <li
        key={task.id}
        className="flex items-start gap-3 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5"
      >
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
