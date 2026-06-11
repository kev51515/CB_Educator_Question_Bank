/**
 * StudentCounselingTasksCard
 * ==========================
 * The STUDENT's own view of the counseling tasks a counselor assigned them for a
 * single (course, student) pair. Read-only for everything except completion +
 * (for gradable tasks) submission: row-level security on `counseling_tasks`
 * returns only the signed-in student's own rows, so this component does no
 * client-side gating. There are deliberately NO add / edit / delete controls.
 *
 * Two task shapes coexist (migration 0140):
 *
 *  1. NON-gradable tasks (or any task when the course has grading disabled): the
 *     classic open/done checkbox. Toggling goes through `complete_counseling_task`
 *     (a student has no direct UPDATE grant); on success we refetch + toast.
 *
 *  2. GRADABLE tasks (settings.enabled && task.gradable): a star-grading
 *     lifecycle replaces the checkbox so the student can glance down the list and
 *     SEE the stars they've earned.
 *       - not_submitted  -> "Submit" button (+ a hint of what on-time earns).
 *       - awaiting_grade -> provisional punctuality stars + on-time/late chip +
 *         "awaiting review"; "Resubmit" iff canResubmit.
 *       - graded         -> final stars + "N of M stars" + feedback block;
 *         "Resubmit to improve" iff canResubmit.
 *     Submission goes through `submit_counseling_task`; RPC error codes are mapped
 *     to friendly toasts.
 *
 * Open tasks sort first, then by due date ascending (nulls last). A past-due open
 * task gets a rose "Overdue" chip. Done tasks render line-through + muted. The
 * "N of M done" progress bar counts both done (non-gradable) and graded tasks.
 *
 * Conventions copied from CourseSharingControls.tsx: `@/lib/supabase`,
 * `useToast`, the `aliveRef` mounted-guard for every setState-after-await,
 * `SkeletonRows`, and slate/indigo dark-mode ring-1 cards. No emojis.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { StarRating } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  fetchGradingSettings,
  gradeState,
  canResubmit,
  type GradingSettings,
} from "../../teacher/counseling/grading";

interface CounselingTask {
  id: string;
  course_id: string;
  student_id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  status: "open" | "done";
  completed_at: string | null;
  // Grading columns (migration 0140) — present on every row via SELECT "*".
  gradable: boolean;
  submitted_at: string | null;
  submission_on_time: boolean | null;
  punctuality_stars: number | null;
  quality_stars: number | null;
  stars: number | null;
  feedback: string | null;
  graded_at: string | null;
  resubmission_count: number;
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

/** Map a submit_counseling_task RPC error code to a friendly message. */
function submitErrorMessage(raw: string): string {
  if (raw.includes("resubmission_limit_reached")) {
    return "You've used all your resubmissions";
  }
  if (raw.includes("resubmission_not_allowed")) {
    return "Resubmissions aren't allowed for this course";
  }
  if (raw.includes("task_not_gradable")) {
    return "This task can't be submitted";
  }
  if (raw.includes("not_authorized")) {
    return "You're not allowed to submit this task";
  }
  return raw;
}

const STAR_WORD = (n: number) => (n === 1 ? "star" : "stars");

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
  const [settings, setSettings] = useState<GradingSettings | null>(null);
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

  // Grading settings fetched once per course; defaults applied by the helper.
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
  const gradingOn = settings?.enabled === true;
  const maxStars = settings?.max_stars ?? 5;

  // A task is "complete" (for the progress bar) when a non-gradable task is done
  // OR a gradable task has been graded.
  const isComplete = useCallback(
    (t: CounselingTask): boolean => {
      const useGrading = gradingOn && t.gradable;
      return useGrading ? gradeState(t) === "graded" : t.status === "done";
    },
    [gradingOn],
  );

  // Open/incomplete first, then due_date ascending (nulls last). Defensive
  // client-side sort mirrors the query order so refetches render stably.
  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ac = isComplete(a);
      const bc = isComplete(b);
      if (ac !== bc) return ac ? 1 : -1;
      const ad = a.due_date;
      const bd = b.due_date;
      if (ad === bd) return 0;
      if (ad === null) return 1;
      if (bd === null) return -1;
      return ad < bd ? -1 : 1;
    });
  }, [tasks, isComplete]);

  // Progress summary across all assigned tasks.
  const total = tasks.length;
  const doneCount = useMemo(
    () => tasks.filter((t) => isComplete(t)).length,
    [tasks, isComplete],
  );
  const pctDone = total === 0 ? 0 : Math.round((doneCount / total) * 100);

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

  const onSubmit = async (task: CounselingTask): Promise<void> => {
    setBusyId(task.id);
    const { error } = await supabase.rpc("submit_counseling_task", {
      p_task_id: task.id,
    });
    if (!aliveRef.current) return;
    setBusyId(null);
    if (error) {
      toast.error("Couldn't submit", submitErrorMessage(error.message));
      return;
    }
    toast.success("Submitted");
    void load();
  };

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          My tasks
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
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="check"
          title="No tasks assigned yet"
          body="When your counselor assigns counseling to-dos, they'll show up here for you to check off."
        />
      ) : (
        <ul className="space-y-2">
          {sorted.map((task) => {
            const useGrading = gradingOn && task.gradable;
            const done = task.status === "done";
            const complete = isComplete(task);
            const overdue =
              !complete && task.due_date !== null && task.due_date < today;
            const busy = busyId === task.id;

            // Lifecycle for gradable tasks.
            const state = gradeState(task);
            const onTimeNow =
              task.due_date === null || today <= task.due_date;
            const resubAllowed =
              settings !== null && canResubmit(task, settings);
            const punctuality = task.punctuality_stars ?? 0;

            return (
              <li
                key={task.id}
                className="flex items-start gap-3 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5"
              >
                {/* Leading control: checkbox for non-gradable; a status glyph for
                    gradable tasks (the actions live in the body). */}
                {useGrading ? (
                  <span
                    aria-hidden
                    className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${
                      complete
                        ? "bg-emerald-600 ring-emerald-600 text-white"
                        : "bg-white dark:bg-slate-950 ring-slate-300 dark:ring-slate-700 text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {complete ? (
                      <svg
                        width={18}
                        height={18}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg
                        width={18}
                        height={18}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.77 6.2 20.84l1.11-6.46-4.7-4.58 6.49-.94z" />
                      </svg>
                    )}
                  </span>
                ) : (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={
                      done
                        ? `Mark "${task.title}" open`
                        : `Mark "${task.title}" done`
                    }
                    disabled={busy}
                    onClick={() => {
                      void onToggle(task);
                    }}
                    className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 disabled:opacity-50 ${
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
                )}

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-bold ${
                      complete
                        ? "line-through text-slate-400 dark:text-slate-500"
                        : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {task.title}
                  </p>
                  {task.details && (
                    <p
                      className={`mt-0.5 text-xs ${
                        complete
                          ? "text-slate-400 dark:text-slate-600"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {task.details}
                    </p>
                  )}
                  {task.due_date && (
                    <span
                      className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                        overdue
                          ? "bg-rose-50 dark:bg-rose-950/40 ring-rose-300 dark:ring-rose-800 text-rose-700 dark:text-rose-300"
                          : "bg-slate-50 dark:bg-slate-800 ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {overdue ? "Overdue · " : ""}
                      {formatDue(task.due_date)}
                    </span>
                  )}

                  {/* Grading lifecycle — only for gradable tasks under grading. */}
                  {useGrading && (
                    <div className="mt-2.5 space-y-2">
                      {state === "not_submitted" && (
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              void onSubmit(task);
                            }}
                            className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {busy ? "Submitting…" : "Submit"}
                          </button>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {onTimeNow ? (
                              task.due_date ? (
                                <>
                                  On time — submit by{" "}
                                  <span className="font-medium text-slate-600 dark:text-slate-300">
                                    {formatDue(task.due_date)}
                                  </span>{" "}
                                  for {settings?.on_time_stars ?? 0}{" "}
                                  {STAR_WORD(settings?.on_time_stars ?? 0)}
                                </>
                              ) : (
                                <>
                                  On time — submitting now earns{" "}
                                  {settings?.on_time_stars ?? 0}{" "}
                                  {STAR_WORD(settings?.on_time_stars ?? 0)}
                                </>
                              )
                            ) : (
                              <>
                                Late — submitting now earns{" "}
                                {settings?.late_stars ?? 0}{" "}
                                {STAR_WORD(settings?.late_stars ?? 0)}
                              </>
                            )}
                          </span>
                        </div>
                      )}

                      {state === "awaiting_grade" && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StarRating
                              value={punctuality}
                              lockedCount={punctuality}
                              max={maxStars}
                              size="sm"
                              label={`${punctuality} of ${maxStars} stars so far, awaiting review`}
                            />
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                                task.submission_on_time
                                  ? "bg-emerald-50 dark:bg-emerald-950/40 ring-emerald-300 dark:ring-emerald-800 text-emerald-700 dark:text-emerald-300"
                                  : "bg-amber-50 dark:bg-amber-950/40 ring-amber-300 dark:ring-amber-800 text-amber-700 dark:text-amber-300"
                              }`}
                            >
                              {task.submission_on_time
                                ? "Submitted on time"
                                : "Submitted late"}
                            </span>
                            <span className="text-xs italic text-slate-500 dark:text-slate-400">
                              awaiting review
                            </span>
                          </div>
                          {resubAllowed && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                void onSubmit(task);
                              }}
                              className="inline-flex min-h-[40px] items-center justify-center rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 px-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                            >
                              {busy ? "Resubmitting…" : "Resubmit"}
                            </button>
                          )}
                        </div>
                      )}

                      {state === "graded" && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StarRating
                              value={task.stars ?? 0}
                              lockedCount={punctuality}
                              max={maxStars}
                              size="sm"
                              label={`${task.stars ?? 0} of ${maxStars} stars`}
                            />
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                              {task.stars ?? 0} of {maxStars}{" "}
                              {STAR_WORD(task.stars ?? 0)}
                            </span>
                          </div>
                          {task.feedback && (
                            <p className="rounded-lg bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                              {task.feedback}
                            </p>
                          )}
                          {resubAllowed && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                void onSubmit(task);
                              }}
                              className="inline-flex min-h-[40px] items-center justify-center rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 px-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                            >
                              {busy ? "Resubmitting…" : "Resubmit to improve"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
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
