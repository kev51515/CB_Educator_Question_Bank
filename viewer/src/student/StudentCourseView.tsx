/**
 * StudentCourseView
 * =================
 * Read-only student view of a single course's modules. Reached via
 * `/courses/:short` (where `:short` is the course `short_code`). Intentionally
 * minimal — students aren't editing anything here, they're orienting to what
 * the course contains.
 *
 * MVP scope:
 *   • Fetch course by short_code (RLS limits to courses the student is
 *     enrolled in).
 *   • List published `course_modules` ordered by position.
 *   • For each module, list its published `module_items` (assignments,
 *     headers, links, pages, files) with a type icon + clickable title
 *     where applicable.
 *   • Assignment items link to `/assignment/:id/take`. Link items open in a
 *     new tab. Header items render as a small subheading. Page/file rows
 *     render their title statically (the v1 student-facing renderer for
 *     pages/files is deferred — clicking shows a toast).
 *   • Locked modules (opens_at in the future) render a lock icon + "Unlocks
 *     <date>" callout and items are inert.
 *
 * Deliberately does NOT reuse the teacher ModulesPage — that surface owns
 * drag-and-drop, inline edit, lock-until, bulk select, etc. We only need
 * the read shape.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { ROUTES } from "../lib/routes";
import {
  type CourseRow,
  type CourseStats,
  type AssignmentDueRow,
  type EffectiveAttemptRow,
  type ModuleRow,
  THIRTY_DAYS_MS,
  teacherName,
  toNumber,
  getErrorMessage,
  isLocked,
  formatDate,
} from "./studentCourseHelpers";
import { ModuleItemRowView } from "./ModuleItemRowView";
import { StatCard } from "./StatCard";

export function StudentCourseView(): JSX.Element {
  const params = useParams<{ short: string }>();
  const navigate = useNavigate();
  const short = (params.short ?? "").toUpperCase();

  const [course, setCourse] = useState<CourseRow | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CourseStats>({
    assignmentsDue: null,
    myAverage: null,
    myAverageSampleSize: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Guard against stale-response races when `short` changes mid-flight.
  const tokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const { data: courseData, error: courseError } = await supabase
          .from("courses")
          .select(
            "id, short_code, name, description, teacher:profiles!courses_teacher_id_fkey(display_name)",
          )
          .eq("short_code", short)
          .maybeSingle();
        if (cancelled) return;
        if (courseError) {
          setError(courseError.message);
          setLoading(false);
          return;
        }
        if (!courseData) {
          setError("Course not found or you don't have access.");
          setLoading(false);
          return;
        }
        const courseRow = courseData as CourseRow;
        setCourse(courseRow);

        const { data: moduleData, error: moduleError } = await supabase
          .from("course_modules")
          .select(
            "id, name, position, published, opens_at, module_items(id, position, item_type, item_ref_id, title, url, indent, published)",
          )
          .eq("class_id", courseRow.id)
          .eq("published", true)
          .order("position", { ascending: true });
        if (cancelled) return;
        if (moduleError) {
          setError(moduleError.message);
          setLoading(false);
          return;
        }

        const rows = ((moduleData ?? []) as unknown as ModuleRow[]).map(
          (m) => ({
            ...m,
            module_items: [...(m.module_items ?? [])].sort(
              (a, b) => a.position - b.position,
            ),
          }),
        );
        setModules(rows);
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setLoading(false);
      }
    };
    if (short) void load();
    else {
      setError("Missing course code.");
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [short]);

  // Quick-stats fetch — runs once we know the course id. Each stat is
  // independent so a single failure degrades to "—" rather than blanking
  // the row. Stale-response guarded via tokenRef.
  useEffect(() => {
    const courseId = course?.id;
    if (!courseId) return;

    const token = ++tokenRef.current;
    setStatsLoading(true);

    const nowIso = new Date().toISOString();
    const cutoff30 = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    void (async () => {
      // 1. Assignments due — open + future due_at + no submitted attempt
      //    by me. RLS already scopes assignment_attempts to my own rows.
      const assignmentsDuePromise = supabase
        .from("assignments")
        .select(
          "id, due_at, assignment_attempts(submitted_at)",
        )
        .eq("course_id", courseId)
        .eq("archived", false)
        .gt("due_at", nowIso)
        .limit(500);

      // 2. My average — assignment_attempts_effective filtered to this
      //    course's assignments via inner join, last 30 days, submitted.
      const myAveragePromise = supabase
        .from("assignment_attempts_effective")
        .select(
          "effective_score, submitted_at, assignments!inner(course_id)",
        )
        .eq("assignments.course_id", courseId)
        .not("submitted_at", "is", null)
        .gte("submitted_at", cutoff30)
        .limit(500);

      const [dueRes, avgRes] = await Promise.all([
        assignmentsDuePromise,
        myAveragePromise,
      ]);

      if (tokenRef.current !== token) return;

      // Assignments due
      let assignmentsDue: number | null;
      if (dueRes.error) {
        assignmentsDue = null;
      } else {
        const dueRows = (dueRes.data ?? []) as unknown as AssignmentDueRow[];
        assignmentsDue = dueRows.filter((a) => {
          const attempts = a.assignment_attempts ?? [];
          const hasSubmitted = attempts.some(
            (att) => att.submitted_at !== null,
          );
          return !hasSubmitted;
        }).length;
      }

      // My average
      let myAverage: number | null = null;
      let myAverageSampleSize = 0;
      if (!avgRes.error) {
        const attempts = (avgRes.data ?? []) as unknown as EffectiveAttemptRow[];
        let sum = 0;
        let count = 0;
        for (const att of attempts) {
          const pct = toNumber(att.effective_score);
          if (pct !== null) {
            sum += pct;
            count += 1;
          }
        }
        if (count > 0) {
          myAverage = sum / count;
          myAverageSampleSize = count;
        }
      }

      if (tokenRef.current !== token) return;
      setStats({ assignmentsDue, myAverage, myAverageSampleSize });
      setStatsLoading(false);
    })();
  }, [course?.id]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          type="button"
          onClick={() => navigate(ROUTES.HOME)}
          className="min-h-[40px] inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <span aria-hidden>←</span> Back
        </button>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-1/2 rounded" />
            <SkeletonRows count={4} />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-rose-200 dark:ring-rose-900 p-6 text-center space-y-2">
            <h2 className="text-base font-semibold text-rose-700 dark:text-rose-300">
              Couldn't open this course
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
          </div>
        )}

        {!loading && !error && course && (
          <>
            <header className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/85 dark:bg-slate-900/70 p-5 space-y-4 motion-safe:transition-all">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
                  Course · {course.short_code}
                </p>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {course.name}
                </h1>
                {(() => {
                  const tname = teacherName(course);
                  return (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {tname && (
                        <>
                          Taught by{" "}
                          <span className="text-slate-700 dark:text-slate-200 font-medium">
                            {tname}
                          </span>
                          <span aria-hidden> · </span>
                        </>
                      )}
                      <span className="font-mono">{course.short_code}</span>
                    </p>
                  );
                })()}
                {course.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 pt-1">
                    {course.description}
                  </p>
                )}
              </div>

              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                role="group"
                aria-label="Course quick stats"
              >
                <StatCard
                  label="Assignments due"
                  value={
                    statsLoading
                      ? null
                      : stats.assignmentsDue !== null
                      ? String(stats.assignmentsDue)
                      : "—"
                  }
                  hint={
                    statsLoading
                      ? undefined
                      : stats.assignmentsDue === 0
                      ? "Nothing pending"
                      : undefined
                  }
                  loading={statsLoading}
                  onClick={() => navigate(ROUTES.HOME)}
                  ariaLabel={
                    statsLoading
                      ? "Assignments due, loading"
                      : `${
                          stats.assignmentsDue ?? "unknown"
                        } assignments due in this course`
                  }
                />
                <StatCard
                  label="My average"
                  value={
                    statsLoading
                      ? null
                      : stats.myAverage !== null
                      ? `${Math.round(stats.myAverage)}%`
                      : "—"
                  }
                  hint={
                    statsLoading
                      ? undefined
                      : stats.myAverageSampleSize > 0
                      ? `${stats.myAverageSampleSize} attempt${
                          stats.myAverageSampleSize === 1 ? "" : "s"
                        } · last 30 days`
                      : "No submitted attempts yet"
                  }
                  loading={statsLoading}
                  ariaLabel={
                    statsLoading
                      ? "My average, loading"
                      : stats.myAverage !== null
                      ? `My average ${Math.round(stats.myAverage)} percent`
                      : "My average not yet available"
                  }
                />
              </div>
            </header>

            {modules.length === 0 ? (
              <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-8 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  No modules yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your teacher hasn't published any modules in this course.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {modules.map((m) => {
                  const locked = isLocked(m.opens_at);
                  return (
                    <section
                      key={m.id}
                      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-4"
                    >
                      <header className="flex items-center justify-between gap-3 mb-2 px-2">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {m.name}
                        </h2>
                        {locked && m.opens_at && (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-full px-2 py-0.5"
                            aria-label={`Locked until ${formatDate(m.opens_at)}`}
                          >
                            <svg
                              width={12}
                              height={12}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <rect x="3" y="11" width="18" height="11" rx="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            Unlocks {formatDate(m.opens_at)}
                          </span>
                        )}
                      </header>
                      {m.module_items.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                          No items in this module.
                        </p>
                      ) : (
                        <ul className="space-y-0.5">
                          {m.module_items.map((it) => (
                            <li key={it.id}>
                              <ModuleItemRowView item={it} locked={locked} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
