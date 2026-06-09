/**
 * StudentCounselingTasksCard
 * ==========================
 * The STUDENT's own view of the counseling tasks a counselor assigned them for a
 * single (course, student) pair. Read-only for everything except completion:
 * row-level security on `counseling_tasks` returns only the signed-in student's
 * own rows, so this component does no client-side gating. There are deliberately
 * NO add / edit / delete controls — a student can only check a task off.
 *
 * Marking done/undone goes through the `complete_counseling_task` RPC (a student
 * has no direct UPDATE grant on the table); on success we refetch + toast. Open
 * tasks sort first, then by due date ascending (nulls last). A past-due open
 * task gets a rose "Overdue" chip. Done tasks render line-through + muted.
 *
 * Conventions copied from CourseSharingControls.tsx: `@/lib/supabase`,
 * `useToast`, the `aliveRef` mounted-guard for every setState-after-await,
 * `SkeletonRows`, and slate/indigo dark-mode ring-1 cards. No emojis.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";

interface CounselingTask {
  id: string;
  course_id: string;
  student_id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  status: "open" | "done";
  completed_at: string | null;
}

interface Props {
  courseId: string;
  studentId: string;
}

/** Today as a YYYY-MM-DD string (local), for comparing against `due_date`. */
function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Human-friendly due-date label, e.g. "Mar 14, 2026". */
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

export function StudentCounselingTasksCard({ courseId, studentId }: Props) {
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

  // Open first, then due_date ascending (nulls last). Defensive client-side
  // sort mirrors the query order so refetches always render stably.
  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      const ad = a.due_date;
      const bd = b.due_date;
      if (ad === bd) return 0;
      if (ad === null) return 1;
      if (bd === null) return -1;
      return ad < bd ? -1 : 1;
    });
  }, [tasks]);

  const onToggle = async (task: CounselingTask): Promise<void> => {
    setBusyId(task.id);
    const nextDone = task.status !== "done";
    const { error } = await supabase.rpc("complete_counseling_task", {
      p_task_id: task.id,
      p_done: nextDone,
    });
    if (!aliveRef.current) return;
    setBusyId(null);
    if (error) {
      toast.error("Couldn't update task", error.message);
      return;
    }
    toast.success(nextDone ? "Task marked done" : "Task reopened");
    void load();
  };

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
        My tasks
      </h3>

      {loading ? (
        <SkeletonRows count={3} />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No tasks assigned yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((task) => {
            const done = task.status === "done";
            const overdue =
              !done && task.due_date !== null && task.due_date < today;
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
                    done
                      ? `Mark "${task.title}" open`
                      : `Mark "${task.title}" done`
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
