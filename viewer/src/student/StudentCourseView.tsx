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
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Skeleton, SkeletonRows } from "@/components/Skeleton";
import { ROUTES } from "@/lib/routes";
import { useProfile } from "@/lib/profile";
import { StudentCounselingProfileCard } from "./counseling/StudentCounselingProfileCard";
import { StudentCollegeListCard } from "./counseling/StudentCollegeListCard";
import { StudentCounselingTasksCard } from "./counseling/StudentCounselingTasksCard";
import {
  type AssignmentMeta,
  type CourseRow,
  type CourseStats,
  type AssignmentDueRow,
  type EffectiveAttemptRow,
  type ModuleItemRow,
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

const collapseKey = (courseId: string): string =>
  `student.courseModules.collapsed:${courseId}`;

/**
 * `:short` is normally a 6-char course short_code, but several flows deep-link
 * by raw course UUID instead — most importantly the managed-seat claim, which
 * redirects to `studentCoursePath(course_id)` (a UUID) after a student claims
 * their seat. Detect that shape so we look the course up by `id` rather than
 * `short_code` (an uppercased UUID would never match a short_code → the course
 * would render "not found" even for a freshly-enrolled student). Postgres
 * parses uuid input case-insensitively, so the uppercased value still matches.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COURSE_SELECT =
  "id, short_code, name, description, course_type, teacher:profiles!courses_teacher_id_fkey(display_name)";

/**
 * Bounded retry budget for the initial course lookup. This surface most often
 * mounts immediately after a navigation — including the moment a student lands
 * here straight after claiming a managed seat, when their session was just
 * established. Rather than pad the happy path with a fixed "joining…" delay (a
 * guess that's both too slow when things are ready and too short when they
 * aren't), we let the existing skeleton cover a few quick re-attempts: a
 * transient network/auth blip self-heals, and a genuine "no access" still
 * surfaces within ~1s once the budget is spent.
 */
const COURSE_FETCH_ATTEMPTS = 3;
const COURSE_RETRY_MS = 350;
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function StudentCourseView(): JSX.Element {
  const params = useParams<{ short: string }>();
  const navigate = useNavigate();
  const short = (params.short ?? "").toUpperCase();
  const { profile } = useProfile();

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
  // Per-assignment metadata (kind, due, my completion) keyed by assignment id.
  const [assignmentMeta, setAssignmentMeta] = useState<Map<string, AssignmentMeta>>(
    () => new Map(),
  );
  // Collapsed module ids (persisted per course).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  // Guard against stale-response races when `short` changes mid-flight.
  const tokenRef = useRef(0);
  const metaTokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        let courseData: CourseRow | null = null;
        let courseError: { message: string } | null = null;
        for (let attempt = 0; attempt < COURSE_FETCH_ATTEMPTS; attempt++) {
          const lookup = supabase.from("courses").select(COURSE_SELECT);
          const res = await (
            UUID_RE.test(short)
              ? lookup.eq("id", short)
              : lookup.eq("short_code", short)
          ).maybeSingle();
          if (cancelled) return;
          courseError = res.error ?? null;
          courseData = (res.data as CourseRow | null) ?? null;
          if (courseData) break;
          if (attempt < COURSE_FETCH_ATTEMPTS - 1) {
            await sleep(COURSE_RETRY_MS);
            if (cancelled) return;
          }
        }
        if (!courseData) {
          setError(
            courseError?.message ??
              "Course not found or you don't have access.",
          );
          setLoading(false);
          return;
        }
        const courseRow = courseData;
        setCourse(courseRow);

        const { data: moduleData, error: moduleError } = await supabase
          .from("course_modules")
          .select(
            "id, name, position, published, opens_at, module_items(id, position, item_type, item_ref_id, title, url, indent, published)",
          )
          .eq("course_id", courseRow.id)
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

  // Assignment ids referenced by published assignment items.
  const assignmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of modules) {
      for (const it of m.module_items) {
        if (it.published && it.item_type === "assignment" && it.item_ref_id) {
          ids.add(it.item_ref_id);
        }
      }
    }
    return [...ids];
  }, [modules]);

  // Enrich assignment items with kind / due / my completion. Degrades silently:
  // a failure just means rows render without badges, not a broken view.
  useEffect(() => {
    if (assignmentIds.length === 0) {
      setAssignmentMeta(new Map());
      return;
    }
    const token = ++metaTokenRef.current;
    void (async () => {
      const [aRes, bRes] = await Promise.all([
        supabase
          .from("assignments")
          .select("id, kind, due_at, short_code, question_count, time_limit_minutes")
          .in("id", assignmentIds),
        supabase
          .from("assignment_best_attempts")
          .select("assignment_id, effective_score, submitted_at")
          .in("assignment_id", assignmentIds),
      ]);
      if (metaTokenRef.current !== token) return;

      const best = new Map<string, { score: number | null; submitted: boolean }>();
      if (!bRes.error) {
        for (const r of (bRes.data ?? []) as Array<{
          assignment_id: string;
          effective_score: number | string | null;
          submitted_at: string | null;
        }>) {
          best.set(r.assignment_id, {
            score: toNumber(r.effective_score),
            submitted: r.submitted_at != null,
          });
        }
      }
      const map = new Map<string, AssignmentMeta>();
      if (!aRes.error) {
        for (const a of (aRes.data ?? []) as Array<{
          id: string;
          kind: string;
          due_at: string | null;
          short_code: string | null;
          question_count: number | null;
          time_limit_minutes: number | null;
        }>) {
          const b = best.get(a.id);
          map.set(a.id, {
            kind: a.kind,
            due_at: a.due_at,
            shortCode: a.short_code,
            questionCount: a.question_count,
            timeLimitMinutes: a.time_limit_minutes,
            bestScore: b?.score ?? null,
            submitted: b?.submitted ?? false,
          });
        }
      }
      if (metaTokenRef.current !== token) return;
      setAssignmentMeta(map);
    })();
  }, [assignmentIds]);

  // Restore collapsed-module state for this course.
  useEffect(() => {
    const courseId = course?.id;
    if (!courseId) return;
    try {
      const raw = window.localStorage.getItem(collapseKey(courseId));
      setCollapsed(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [course?.id]);

  const toggleCollapse = (moduleId: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      if (course?.id) {
        try {
          window.localStorage.setItem(
            collapseKey(course.id),
            JSON.stringify([...next]),
          );
        } catch {
          // ignore (private mode / quota)
        }
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          type="button"
          onClick={() => navigate(ROUTES.STUDENT_COURSES)}
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

            {/* Counseling workspace (student side) — only for counseling
                courses: their own profile, college list, and assigned tasks.
                No AI here by design — AI tools are counselor-only. */}
            {course.course_type === "counseling" && profile?.id && (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  College counseling
                </h2>
                <StudentCounselingProfileCard courseId={course.id} studentId={profile.id} />
                <StudentCollegeListCard courseId={course.id} studentId={profile.id} />
                <StudentCounselingTasksCard courseId={course.id} studentId={profile.id} />
              </section>
            )}

            {modules.length === 0 ? (
              // Counseling courses are driven by the counseling section above,
              // not modules — don't show a "nothing published" modules notice.
              course.course_type === "counseling" ? null : (
                <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-8 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Nothing published yet
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Your teacher hasn't published any modules in this course. Check
                    back soon — new assignments and tests will appear here.
                  </p>
                </div>
              )
            ) : (
              <div className="space-y-4">
                {modules.map((m) => {
                  const locked = isLocked(m.opens_at);
                  const items: ModuleItemRow[] = m.module_items.filter(
                    (it) => it.published,
                  );
                  const assignmentItems = items.filter(
                    (it) => it.item_type === "assignment" && it.item_ref_id,
                  );
                  const total = assignmentItems.length;
                  const done = assignmentItems.filter(
                    (it) => assignmentMeta.get(it.item_ref_id ?? "")?.submitted,
                  ).length;
                  const isCollapsed = collapsed.has(m.id);
                  const bodyId = `mod-${m.id}-body`;
                  return (
                    <section
                      key={m.id}
                      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => toggleCollapse(m.id)}
                        aria-expanded={!isCollapsed}
                        aria-controls={bodyId}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left motion-safe:transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                      >
                        <svg
                          aria-hidden
                          width={16}
                          height={16}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`flex-none text-slate-400 motion-safe:transition-transform ${
                            isCollapsed ? "" : "rotate-90"
                          }`}
                        >
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                        <h2 className="flex-1 min-w-0 truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                          {m.name}
                        </h2>
                        {total > 0 && (
                          <span
                            className={`flex-none inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                              done >= total
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
                                : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                            }`}
                          >
                            {done >= total ? "✓ " : ""}
                            {done}/{total} done
                          </span>
                        )}
                        {locked && m.opens_at && (
                          <span
                            className="flex-none inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-200 dark:ring-amber-900 rounded-full px-2 py-0.5"
                            aria-label={`Unlocks ${formatDate(m.opens_at)}`}
                          >
                            <svg
                              width={11}
                              height={11}
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
                      </button>
                      {!isCollapsed && (
                        <div id={bodyId} className="px-2 pb-2">
                          {items.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                              No items in this module yet.
                            </p>
                          ) : (
                            <ul className="space-y-0.5">
                              {items.map((it) => (
                                <li key={it.id}>
                                  <ModuleItemRowView
                                    item={it}
                                    locked={locked}
                                    meta={
                                      it.item_ref_id
                                        ? assignmentMeta.get(it.item_ref_id)
                                        : undefined
                                    }
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
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
