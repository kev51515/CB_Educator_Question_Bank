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
import {
  ROUTES,
  assignmentReviewPath,
  assignmentTakePath,
  studentTestRunPath,
} from "@/lib/routes";
import { buildJourney, type JourneyCell } from "@/journey/buildJourney";
import { JourneyLegend } from "@/journey/JourneyGrid";
import { JourneySpine } from "@/journey/JourneySpine";
import { JourneyHud } from "@/journey/JourneyHud";
import { JourneyCellPopover } from "@/journey/JourneyCellPopover";
import { levelFor } from "@/journey/mastery";
import { useToast } from "@/components/Toast";
import { useProfile } from "@/lib/profile";
import { domainOf, studentLabel } from "@/lib/domain";
import { useDomain } from "@/lib/DomainProvider";
import { useStudentPending } from "./useStudentPending";
import { StudentCounselingProfileCard } from "./counseling/StudentCounselingProfileCard";
import { StudentCollegeListCard } from "./counseling/StudentCollegeListCard";
import { StudentCounselingTasksCard } from "./counseling/StudentCounselingTasksCard";
import { PlayerProfileCard } from "./pickleball/PlayerProfileCard";
import { PlayerLessonsTimeline } from "./pickleball/PlayerLessonsTimeline";
import { LessonCheckinCard } from "./pickleball/LessonCheckinCard";
import { ProgressCard } from "./pickleball/ProgressCard";
import { HomeworkCard } from "./pickleball/HomeworkCard";
import { EventsCard } from "./pickleball/EventsCard";
import { CoachProfileCard } from "./pickleball/CoachProfileCard";
import { CoachDevelopmentCard } from "./pickleball/CoachDevelopmentCard";
import { CoachEvaluationsCard } from "./pickleball/CoachEvaluationsCard";
import { CoachHoursCard } from "./pickleball/CoachHoursCard";
import { ChatPanel } from "@/components/pickleball/ChatPanel";
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
import { ScoreTrajectoryCard } from "./ScoreTrajectoryCard";
import { StudyCoachPanel } from "./StudyCoachPanel";

const collapseKey = (courseId: string): string =>
  `student.courseModules.collapsed:${courseId}`;

/** Journey | List preference, persisted per (user-agnostic) course. */
const viewKey = (courseId: string): string => `student.courseView:${courseId}`;

type CourseViewMode = "journey" | "list";

/**
 * TEMPORARY (2026-06): the student-facing Journey view is disabled while we
 * test the rest of the course experience — students see the List view only,
 * and the Journey|List toggle is hidden. Flip back to `true` to restore it.
 * (Saved `student.courseView:*` prefs are ignored while this is false, so
 * re-enabling brings everyone's prior choice back untouched.)
 */
const STUDENT_JOURNEY_ENABLED: boolean = false;

/**
 * Runtime check: the build flag above, OR the `journey.preview=1`
 * localStorage escape hatch so staff/QA can preview the student journey
 * on a real account while the flag is off.
 */
function studentJourneyEnabled(): boolean {
  if (STUDENT_JOURNEY_ENABLED) return true;
  try {
    return window.localStorage.getItem("journey.preview") === "1";
  } catch {
    return false;
  }
}

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
  // Stable for the lifetime of the mount (flag + localStorage escape hatch).
  const [journeyEnabled] = useState(studentJourneyEnabled);

  const [course, setCourse] = useState<CourseRow | null>(null);

  // Theme the accent by the course's domain while viewing it (e.g. a Player in
  // a pickleball course sees orange), reverting on leave.
  const { previewDomain } = useDomain();
  useEffect(() => {
    if (course?.course_type) previewDomain(domainOf(course.course_type));
    return () => previewDomain(null);
  }, [course?.course_type, previewDomain]);
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
  // Key (sorted id list) of the assignment set whose meta has genuinely
  // finished loading. The seal-moment diff only runs when this matches the
  // CURRENT id set — a plain boolean raced: in the commit where modules
  // first arrive, a stale `true` from the empty-ids pass let the diff
  // record a zero-point snapshot and then falsely "celebrate" real data.
  const [metaLoadedFor, setMetaLoadedFor] = useState<string | null>(null);
  // Collapsed module ids (persisted per course).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // Journey (default for class courses) vs the timeline list — persisted.
  const [viewMode, setViewMode] = useState<CourseViewMode>("journey");
  // Slugs of full-length tests I've submitted. Done/not-done only — scores
  // are release-gated by design (0075), see docs/JOURNEY_VIEW.md.
  const [doneTestSlugs, setDoneTestSlugs] = useState<Set<string>>(
    () => new Set(),
  );
  // Assignment ids the student has already opened (0224) — drives the per-item
  // "new" dot: an unsubmitted, never-opened assignment dots; opening it clears.
  const [seenAssignmentIds, setSeenAssignmentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const toast = useToast();

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
            "id, name, position, published, opens_at, module_items(id, position, item_type, item_ref_id, title, url, indent, published, config)",
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

  // Opening the course clears its "new since last seen" badges (sidebar
  // Courses count, per-course pills). Pending WORK (unstarted assignments)
  // is not seen-gated and stays until submitted.
  const { markCourseSeen } = useStudentPending();
  useEffect(() => {
    const courseId = course?.id;
    if (!courseId) return;
    void markCourseSeen(courseId);
  }, [course?.id, markCourseSeen]);

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
        .eq("hidden", false)
        .gt("due_at", nowIso)
        .limit(500);

      // 2. My average — assignment_attempts_effective filtered to this
      //    course's assignments via inner join, last 30 days, submitted.
      //    The effective view doesn't expose `hidden`, so we filter on the
      //    inner-joined assignments relation instead (same pattern as the
      //    course_id filter above) to exclude hidden skill-drill assignments.
      const myAveragePromise = supabase
        .from("assignment_attempts_effective")
        .select(
          "effective_score, submitted_at, assignments!inner(course_id, hidden)",
        )
        .eq("assignments.course_id", courseId)
        .eq("assignments.hidden", false)
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
    const idsKey = [...assignmentIds].sort().join(",");
    if (assignmentIds.length === 0) {
      setAssignmentMeta(new Map());
      setMetaLoadedFor(idsKey);
      return;
    }
    setMetaLoadedFor(null);
    const token = ++metaTokenRef.current;
    void (async () => {
      const [aRes, bRes] = await Promise.all([
        supabase
          .from("assignments")
          .select("id, kind, due_at, short_code, question_count, time_limit_minutes")
          .in("id", assignmentIds),
        supabase
          .from("assignment_best_attempts")
          .select("assignment_id, attempt_id, effective_score, submitted_at")
          .in("assignment_id", assignmentIds),
      ]);
      if (metaTokenRef.current !== token) return;

      const best = new Map<
        string,
        { score: number | null; submitted: boolean; attemptId: string | null }
      >();
      if (!bRes.error) {
        for (const r of (bRes.data ?? []) as Array<{
          assignment_id: string;
          attempt_id: string | null;
          effective_score: number | string | null;
          submitted_at: string | null;
        }>) {
          best.set(r.assignment_id, {
            score: toNumber(r.effective_score),
            submitted: r.submitted_at != null,
            attemptId: r.attempt_id,
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
            bestAttemptId: b?.attemptId ?? null,
          });
        }
      }
      if (metaTokenRef.current !== token) return;
      setAssignmentMeta(map);
      // Only mark loaded when the attempt data actually arrived — the seal
      // diff must never run against a silently-failed (empty) best map.
      if (!aRes.error && !bRes.error) setMetaLoadedFor(idsKey);
    })();
  }, [assignmentIds]);

  // Which of this course's assignments has the student already opened? (0224)
  // RLS returns only the caller's own rows, so a flat select is safe. Degrades
  // silently (no rows → everything dots until opened, the pre-0224 behavior).
  useEffect(() => {
    if (assignmentIds.length === 0) {
      setSeenAssignmentIds(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("student_assignment_seen")
        .select("assignment_id")
        .in("assignment_id", assignmentIds);
      if (cancelled || error) return;
      setSeenAssignmentIds(
        new Set((data ?? []).map((r) => (r as { assignment_id: string }).assignment_id)),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentIds]);

  // Per-item "new/pending" dot set: assignment items that aren't submitted and
  // haven't been opened yet. Matches the Courses badge's unstarted count, so
  // the badge → course → exact item wayfinding stays consistent.
  const pendingItemRefIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [refId, meta] of assignmentMeta.entries()) {
      if (meta.submitted !== true && !seenAssignmentIds.has(refId)) ids.add(refId);
    }
    return ids;
  }, [assignmentMeta, seenAssignmentIds]);

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

  // Restore the Journey | List preference (journey is the default).
  useEffect(() => {
    const courseId = course?.id;
    if (!courseId) return;
    try {
      const raw = window.localStorage.getItem(viewKey(courseId));
      setViewMode(raw === "list" ? "list" : "journey");
    } catch {
      setViewMode("journey");
    }
  }, [course?.id]);

  // My submitted full-test runs → done states for journey test cells.
  // Degrades silently: a failure just renders those cells as not-done.
  useEffect(() => {
    const courseId = course?.id;
    if (!courseId) return;
    let alive = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("list_my_test_runs");
        if (!alive || error) return;
        const slugs = new Set<string>();
        for (const r of (data ?? []) as Array<{ test_slug: string | null }>) {
          if (r.test_slug) slugs.add(r.test_slug);
        }
        setDoneTestSlugs(slugs);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      alive = false;
    };
  }, [course?.id]);

  const isClassCourse = !course?.course_type || course.course_type === "class";

  const journey = useMemo(
    () =>
      buildJourney(
        modules.map((m) => ({
          id: m.id,
          name: m.name,
          published: m.published,
          opens_at: m.opens_at,
          items: m.module_items,
        })),
        {
          assignment: (refId) => {
            const meta = assignmentMeta.get(refId);
            if (!meta) return undefined;
            return {
              kind: meta.kind,
              dueAt: meta.due_at,
              score: meta.bestScore,
              submitted: meta.submitted,
              questionCount: meta.questionCount,
              timeLimitMinutes: meta.timeLimitMinutes,
              attemptId: meta.bestAttemptId ?? null,
            };
          },
          fullTestDone: (slug) => doneTestSlugs.has(slug),
        },
      ),
    [modules, assignmentMeta, doneTestSlugs],
  );

  // ── Quiet-ledger seal moment (decision 3A, docs/JOURNEY_VIEW.md) ─────────
  // Diff the sealed set + points against a per-course localStorage snapshot;
  // newly sealed cells play the gold stamp, the HUD shows the points delta,
  // and crossing a level fires a toast. Only diffs once meta has actually
  // loaded (a failed fetch must not read as "everything un-sealed"), and
  // only when a prior snapshot exists (first visit just records).
  const [justSealed, setJustSealed] = useState<Set<string>>(() => new Set());
  const [pointsDelta, setPointsDelta] = useState(0);
  useEffect(() => {
    if (!journeyEnabled) return;
    const courseId = course?.id;
    if (!courseId || loading) return;
    // Meta must have completed for exactly the id set currently on screen.
    const idsKey = [...assignmentIds].sort().join(",");
    if (metaLoadedFor !== idsKey) return;
    const sealedRefs = journey.units
      .flatMap((u) => u.cells)
      .filter((c) => c.state === "sealed" && c.refId)
      .map((c) => c.refId as string);
    const key = `journey.snapshot:${courseId}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const prev = JSON.parse(raw) as { sealed: string[]; points: number };
        const prevSealed = new Set(prev.sealed ?? []);
        const fresh = sealedRefs.filter((id) => !prevSealed.has(id));
        if (fresh.length > 0) {
          const cells = journey.units
            .flatMap((u) => u.cells)
            .filter((c) => c.refId && fresh.includes(c.refId));
          setJustSealed(new Set(cells.map((c) => c.id)));
          const first = cells[0];
          toast.success(
            fresh.length === 1
              ? `Seal earned — ${first?.title ?? "nice work"}`
              : `${fresh.length} seals earned`,
            fresh.length === 1 && first?.score !== null && first
              ? `${Math.round(first.score)}% · +${first.earned} mastery pts`
              : `+${cells.reduce((n, c) => n + c.earned, 0)} mastery pts`,
          );
        }
        const delta = journey.earned - (prev.points ?? 0);
        if (delta > 0) setPointsDelta(delta);
        const prevLevel = levelFor(prev.points ?? 0);
        const curLevel = levelFor(journey.earned);
        if (curLevel.level > prevLevel.level) {
          toast.success(
            `Level ${curLevel.level} — ${curLevel.name}`,
            "Your mastery level just went up.",
          );
        }
      }
      window.localStorage.setItem(
        key,
        JSON.stringify({ sealed: sealedRefs, points: journey.earned }),
      );
    } catch {
      // localStorage unavailable — celebration is best-effort only
    }
    // journey identity changes with its inputs; diff exactly once per load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, metaLoadedFor, loading, journey]);

  const setView = (mode: CourseViewMode): void => {
    setViewMode(mode);
    if (course?.id) {
      try {
        window.localStorage.setItem(viewKey(course.id), mode);
      } catch {
        // ignore (private mode / quota)
      }
    }
  };

  // Journey cells navigate exactly like the list rows (ModuleItemRowView).
  const openJourneyCell = (cell: JourneyCell): void => {
    if (cell.refId) {
      navigate(assignmentTakePath(cell.refId));
      return;
    }
    if (cell.kind === "fulltest" && cell.testSlug) {
      // Preserve a `?m=<first>-<last>` module-subset query if present.
      const afterPrefix = (cell.url ?? "").replace(/^\/test\//, "");
      const qIndex = afterPrefix.indexOf("?");
      const testQuery = qIndex >= 0 ? afterPrefix.slice(qIndex) : "";
      navigate(`${studentTestRunPath(cell.testSlug)}${testQuery}`);
      return;
    }
    if (cell.url) {
      window.open(cell.url, "_blank", "noopener,noreferrer");
      return;
    }
    toast.info(`${cell.title} — viewer coming soon`);
  };

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          type="button"
          onClick={() => navigate(ROUTES.STUDENT_COURSES)}
          className="min-h-[44px] inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-3.5 w-3.5 flex-none"
          >
            <path d="M15 18 9 12l6-6" />
          </svg>{" "}
          Back
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
            <header className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 shadow-card p-5 space-y-4 motion-safe:transition-all">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
                  Course
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="page-title text-3xl font-bold text-slate-900 dark:text-slate-100">
                    {course.name}
                  </h1>
                  {/* The course code appears exactly once — this quiet mono chip. */}
                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
                    {course.short_code}
                  </span>
                  {/* Role chip only when it carries information beyond the
                      obvious (Advisee / Player / Coach-in-training). */}
                  {course.course_type && course.course_type !== "class" && (
                    <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
                      {studentLabel(course.course_type)}
                    </span>
                  )}
                </div>
                {(() => {
                  const tname = teacherName(course);
                  if (!tname) return null;
                  return (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Taught by{" "}
                      <span className="text-slate-700 dark:text-slate-200 font-medium">
                        {tname}
                      </span>
                    </p>
                  );
                })()}
                {course.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 pt-1">
                    {course.description}
                  </p>
                )}
                <div className="ivy-rule" aria-hidden="true" />
              </div>

              {/* SAT/class quick-stats — not meaningful for a counseling or
                  pickleball course. */}
              {course.course_type !== "counseling" &&
                course.course_type !== "pickleball_player" &&
                course.course_type !== "pickleball_coach" && (
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
                  /* Ceremonial gold is for the real numeral only — the empty
                     em-dash renders as a plain slate dash + note. */
                  ceremonial={stats.myAverage !== null}
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
              )}

              {/* Score trajectory + target gap — the SAT-prep headline signal.
                  Academic (class) courses only; the card self-gates to an
                  honest locked state until the student has ≥3 released tests. */}
              {isClassCourse && <ScoreTrajectoryCard className="mt-3" />}
              {isClassCourse && <StudyCoachPanel className="mt-3" />}
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

            {/* Pickleball — Players track: profile + lessons timeline + chat. */}
            {course.course_type === "pickleball_player" && profile?.id && (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  My pickleball
                </h2>
                <PlayerProfileCard courseId={course.id} studentId={profile.id} />
                <ProgressCard courseId={course.id} studentId={profile.id} />
                <LessonCheckinCard courseId={course.id} studentId={profile.id} />
                <PlayerLessonsTimeline courseId={course.id} studentId={profile.id} />
                <HomeworkCard courseId={course.id} studentId={profile.id} />
                <EventsCard courseId={course.id} studentId={profile.id} />
                <ChatPanel courseId={course.id} selfId={profile.id} canModerate={false} />
              </section>
            )}

            {/* Pickleball — Coaches track: profile + development + hours + chat. */}
            {course.course_type === "pickleball_coach" && profile?.id && (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  My coaching
                </h2>
                <CoachProfileCard courseId={course.id} studentId={profile.id} />
                <CoachDevelopmentCard courseId={course.id} studentId={profile.id} />
                <CoachEvaluationsCard courseId={course.id} studentId={profile.id} />
                <CoachHoursCard courseId={course.id} studentId={profile.id} />
                <ChatPanel courseId={course.id} selfId={profile.id} />
              </section>
            )}

            {modules.length === 0 ? (
              // Counseling + pickleball courses are driven by the sections above,
              // not modules — don't show a "nothing published" modules notice.
              course.course_type === "counseling" ||
              course.course_type === "pickleball_player" ||
              course.course_type === "pickleball_coach" ? null : (
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
                {isClassCourse && journeyEnabled && (
                  <div
                    className="inline-flex items-center rounded-full bg-indigo-600/[0.08] dark:bg-indigo-400/10 p-0.5"
                    role="tablist"
                    aria-label="Course view"
                  >
                    {(["journey", "list"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={viewMode === mode}
                        onClick={() => setView(mode)}
                        className={`min-h-[36px] rounded-full px-4 text-xs font-semibold motion-safe:transition-colors ${
                          viewMode === mode
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        {mode === "journey" ? "Journey" : "List"}
                      </button>
                    ))}
                  </div>
                )}

                {isClassCourse && journeyEnabled && viewMode === "journey" ? (
                  <>
                    <JourneyHud
                      earned={journey.earned}
                      possible={journey.possible}
                      delta={pointsDelta}
                    />
                    <JourneyLegend />
                    <JourneySpine
                      journey={journey}
                      onOpenCell={openJourneyCell}
                      justSealed={justSealed}
                      // Decision 1A: trackable cells open the anchored detail
                      // popover; full tests keep direct nav (the runner owns
                      // resume/score states the popover can't know).
                      hasPopover={(cell) => cell.kind !== "fulltest"}
                      popover={(cell, close) => (
                        <JourneyCellPopover
                          cell={cell}
                          onOpen={() => {
                            close();
                            openJourneyCell(cell);
                          }}
                          onReview={
                            cell.refId && cell.info?.attemptId
                              ? () => {
                                  close();
                                  navigate(
                                    assignmentReviewPath(
                                      cell.refId as string,
                                      cell.info?.attemptId as string,
                                    ),
                                  );
                                }
                              : undefined
                          }
                        />
                      )}
                    />
                  </>
                ) : (
                <>
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
                  // Any unopened/unsubmitted assignment in this group → header
                  // dot so a collapsed group still says "something new in here".
                  const modulePending =
                    !locked &&
                    assignmentItems.some((it) =>
                      pendingItemRefIds.has(it.item_ref_id ?? ""),
                    );
                  const isCollapsed = collapsed.has(m.id);
                  const bodyId = `mod-${m.id}-body`;
                  return (
                    <section
                      key={m.id}
                      className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-card overflow-hidden"
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
                        {modulePending && (
                          <span
                            className="flex-none h-2 w-2 rounded-full bg-rose-500"
                            aria-label="New or unopened items in this group"
                            title="New or unopened items in this group"
                          />
                        )}
                        {total > 0 && (
                          <span
                            className={`flex-none inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                              done >= total
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
                                : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                            }`}
                          >
                            {done >= total && (
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                                className="mr-1 h-[11px] w-[11px] flex-none"
                              >
                                <path d="M4 12.5 9.5 18 20 6.5" />
                              </svg>
                            )}
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
                        <div
                          id={bodyId}
                          className="border-t border-slate-100 dark:border-slate-800"
                        >
                          {items.length === 0 ? (
                            // Published module, nothing published inside (all
                            // items draft, or genuinely empty). Quiet one-liner
                            // — NOT the empty-state CTA card: "no items yet"
                            // would be misleading when the teacher has drafts
                            // staged, and there's no action a student can take.
                            <p className="px-4 py-3 text-sm italic text-slate-400 dark:text-slate-500">
                              Content coming soon.
                            </p>
                          ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                              {items.map((it) => (
                                <li key={it.id}>
                                  <ModuleItemRowView
                                    item={it}
                                    locked={locked}
                                    pending={
                                      !!it.item_ref_id &&
                                      pendingItemRefIds.has(it.item_ref_id)
                                    }
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
                </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
