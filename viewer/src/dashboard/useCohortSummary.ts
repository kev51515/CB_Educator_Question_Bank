/**
 * useCohortSummary
 * ================
 * Powers the small "Cohort summary" widget on the staff Dashboard. While
 * NeedsAttentionPanel above it is *triage* (concrete rows of work waiting on
 * Maya), this hook surfaces *health stats* — a per-cohort scoreboard so she
 * can scan the temperature of every class she runs without clicking through.
 *
 * Implementation notes
 * --------------------
 *  - Three primary queries kicked off in parallel per teacher:
 *      1. courses the teacher owns (non-archived), with embedded
 *         course_memberships(count) → student count per cohort.
 *      2. assignment_attempts in the last 7 days filtered to the teacher's
 *         assignments via inner-join on assignments → submissions-this-week.
 *      3. assignment_attempts_effective (view from 0056/0057) over the last
 *         30 days for the teacher's assignments → average effective_score
 *         per course.
 *    Plus a derived "needs N" count from sub-queries 2 + ungraded + past-due
 *    counts; we keep this simple and cheap rather than re-running the full
 *    NeedsAttentionPanel logic here.
 *
 *  - Graceful degradation: if `assignment_attempts_effective` or
 *    `effective_score` is missing on this DB (pre-0056/0057), we fall back
 *    to plain `assignment_attempts.score_percent`. We never throw on
 *    individual sub-query failure — we surface the rows we can compute and
 *    keep `avgEffectiveScore` null where stats are unavailable.
 *
 *  - Cap at 12 rows. Most teachers have ≤6 cohorts; Maya specifically has
 *    ~10. The cap is defensive against power-users with 20+ archived/active
 *    courses showing up on screen as a wall.
 *
 *  - Workspace scoping: the hook reads the active domain from `useDomain()`
 *    and keeps only courses whose `course_type` maps to it (domainOf) BEFORE
 *    deriving courseIds, so every downstream stat is domain-scoped. A domain
 *    switch refetches. We over-fetch (4× the row cap) because the domain
 *    filter is client-side — domainOf's null/unknown→academic fallback can't
 *    be expressed as a PostgREST predicate — then cap after filtering.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDomain } from "@/lib/DomainProvider";
import { domainOf } from "@/lib/domain";

export const MAX_COHORT_ROWS = 12;

export interface CohortRow {
  courseId: string;
  courseShortCode: string;
  courseName: string;
  studentCount: number;
  submissionsThisWeek: number;
  /** Average effective_score across attempts in the last 30 days. Null if 0 attempts. */
  avgEffectiveScore: number | null;
  /** Ungraded submissions + past-due assignment count for this cohort. */
  needsAttentionCount: number;
}

export interface UseCohortSummary {
  rows: CohortRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// ─── Internal row shapes ──────────────────────────────────────────────────

interface CourseRow {
  id: string;
  short_code: string;
  name: string;
  archived: boolean;
  course_type: string | null;
  course_memberships: { count: number }[] | null;
}

interface AttemptScoreRow {
  course_id: string | null;
  effective_score?: number | string | null;
  score_percent?: number | string | null;
  score_override?: number | string | null;
  submitted_at: string | null;
  graded_at?: string | null;
  feedback_text?: string | null;
  assignment_id: string;
  assignment?:
    | { course_id: string }
    | { course_id: string }[]
    | null;
}

interface PastDueRow {
  course_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load cohort summary.";
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function pickCourseId(
  embedded:
    | { course_id: string }
    | { course_id: string }[]
    | null
    | undefined,
): string | null {
  if (!embedded) return null;
  if (Array.isArray(embedded)) return embedded[0]?.course_id ?? null;
  return embedded.course_id;
}

function isMissingColumnError(
  message: string | undefined | null,
  needle: string,
): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes(needle.toLowerCase()) &&
    (m.includes("does not exist") ||
      m.includes("column") ||
      m.includes("relation"))
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useCohortSummary(teacherId: string | null): UseCohortSummary {
  // Active workspace — the summary hard-scopes to it (refetch on switch).
  const { domain } = useDomain();
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!teacherId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // ── 1. Teacher's non-archived courses + student counts ──────────────
      // Over-fetch then domain-filter client-side (see header note), then cap.
      const coursesRes = await supabase
        .from("courses")
        .select(
          "id, short_code, name, archived, course_type, course_memberships(count)",
        )
        .eq("teacher_id", teacherId)
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(MAX_COHORT_ROWS * 4);

      if (coursesRes.error) {
        setError(coursesRes.error.message);
        setRows([]);
        return;
      }

      const fetchedCourses = (coursesRes.data ?? []) as unknown as CourseRow[];
      // Workspace scope BEFORE courseIds derivation — every downstream
      // query (submissions, scores, needs pills) inherits it.
      const courseRows = fetchedCourses
        .filter((c) => domainOf(c.course_type) === domain)
        .slice(0, MAX_COHORT_ROWS);
      if (courseRows.length === 0) {
        setRows([]);
        return;
      }

      // Explicit course-id scope for all secondary queries. RLS still filters
      // server-side, but pinning these queries to *exactly* the courses we'll
      // surface stops PostgREST from streaming back rows from outside the
      // teacher's dashboard window (e.g. archived cohorts beyond MAX_COHORT_ROWS).
      const courseIds = courseRows.map((c) => c.id);

      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const nowIso = new Date().toISOString();

      // Phase 1 of the 2-phase scope: fetch assignment ids belonging to the
      // teacher's visible courses. PostgREST's `.in()` doesn't reach into
      // embedded foreign keys via the JS SDK, so we resolve the list of
      // assignment ids first and pass them into the attempt-side queries.
      const assignmentsRes = await supabase
        .from("assignments")
        .select("id, course_id")
        .eq("hidden", false)
        .in("course_id", courseIds);

      if (assignmentsRes.error) {
        setError(assignmentsRes.error.message);
        setRows([]);
        return;
      }

      const assignmentsList = (assignmentsRes.data ?? []) as Array<{
        id: string;
        course_id: string;
      }>;
      const assignmentIds = assignmentsList.map((a) => a.id);
      const assignmentCourseById = new Map<string, string>();
      for (const a of assignmentsList) assignmentCourseById.set(a.id, a.course_id);

      // ── 2. Submissions in the last 7 days for teacher's assignments ─────
      // Scoped explicitly to the assignments we just resolved so RLS isn't
      // the only gatekeeper.
      const submissionsPromise =
        assignmentIds.length === 0
          ? Promise.resolve({ data: [], error: null } as const)
          : supabase
              .from("assignment_attempts")
              .select(
                "assignment_id, submitted_at, " +
                  "assignment:assignments!inner(course_id)",
              )
              .not("submitted_at", "is", null)
              .gte("submitted_at", sevenDaysAgo)
              .in("assignment_id", assignmentIds)
              .limit(500);

      // ── 3. Effective-score over last 30 days ────────────────────────────
      // Primary path uses the 0056/0057 view. Fallback to plain score_percent
      // if the view doesn't exist on this DB.
      const effectiveScorePromise =
        assignmentIds.length === 0
          ? Promise.resolve({ data: [], error: null } as const)
          : supabase
              .from("assignment_attempts_effective")
              .select(
                "assignment_id, effective_score, submitted_at, " +
                  "assignment:assignments!inner(course_id)",
              )
              .not("submitted_at", "is", null)
              .gte("submitted_at", thirtyDaysAgo)
              .in("assignment_id", assignmentIds)
              .limit(1000);

      // ── 4. Ungraded count for "needs" pill ──────────────────────────────
      const ungradedPromise =
        assignmentIds.length === 0
          ? Promise.resolve({ data: [], error: null } as const)
          : supabase
              .from("assignment_attempts")
              .select(
                "assignment_id, submitted_at, graded_at, feedback_text, " +
                  "assignment:assignments!inner(course_id)",
              )
              .not("submitted_at", "is", null)
              .is("graded_at", null)
              .in("assignment_id", assignmentIds)
              .limit(500);

      // ── 5. Past-due count for "needs" pill ──────────────────────────────
      // Filters directly on assignments.course_id — no embed gymnastics.
      const pastDuePromise = supabase
        .from("assignments")
        .select("course_id, due_at, archived")
        .lt("due_at", nowIso)
        .eq("archived", false)
        .eq("hidden", false)
        .in("course_id", courseIds)
        .limit(500);

      const [submissionsRes, effectiveRes, ungradedResRaw, pastDueRes] =
        await Promise.all([
          submissionsPromise,
          effectiveScorePromise,
          ungradedPromise,
          pastDuePromise,
        ]);

      // Index courses by id; we'll iterate this set to produce the final rows
      // in the same display order the query returned.
      const courseById = new Map<
        string,
        { row: CourseRow; agg: { count: number; sum: number; subs: number; needs: number } }
      >();
      for (const row of courseRows) {
        courseById.set(row.id, {
          row,
          agg: { count: 0, sum: 0, subs: 0, needs: 0 },
        });
      }

      // ── Submissions bucket ──────────────────────────────────────────────
      if (!submissionsRes.error && submissionsRes.data) {
        const subs = submissionsRes.data as unknown as AttemptScoreRow[];
        for (const s of subs) {
          const cid = pickCourseId(s.assignment);
          if (!cid) continue;
          const entry = courseById.get(cid);
          if (!entry) continue;
          entry.agg.subs += 1;
        }
      }

      // ── Effective-score bucket (with fallback) ──────────────────────────
      let scoreRows: AttemptScoreRow[] = [];
      if (effectiveRes.error) {
        if (
          isMissingColumnError(effectiveRes.error.message, "effective_score") ||
          isMissingColumnError(
            effectiveRes.error.message,
            "assignment_attempts_effective",
          )
        ) {
          // Fallback path — plain attempts + score_percent, still scoped.
          if (assignmentIds.length > 0) {
            const fallback = await supabase
              .from("assignment_attempts")
              .select(
                "assignment_id, score_percent, submitted_at, " +
                  "assignment:assignments!inner(course_id)",
              )
              .not("submitted_at", "is", null)
              .gte("submitted_at", thirtyDaysAgo)
              .in("assignment_id", assignmentIds)
              .limit(1000);
            if (!fallback.error && fallback.data) {
              scoreRows = fallback.data as unknown as AttemptScoreRow[];
            }
          }
        }
        // Other errors: just leave scores empty so avg stays null. We don't
        // bubble this as a hard error — degraded > broken.
      } else if (effectiveRes.data) {
        scoreRows = effectiveRes.data as unknown as AttemptScoreRow[];
      }

      for (const s of scoreRows) {
        const cid = pickCourseId(s.assignment);
        if (!cid) continue;
        const entry = courseById.get(cid);
        if (!entry) continue;
        const v =
          toNumber(s.effective_score) ?? toNumber(s.score_percent);
        if (v === null) continue;
        entry.agg.count += 1;
        entry.agg.sum += v;
      }

      // ── Needs: ungraded ─────────────────────────────────────────────────
      if (!ungradedResRaw.error && ungradedResRaw.data) {
        const ungraded = ungradedResRaw.data as unknown as AttemptScoreRow[];
        for (const u of ungraded) {
          // If graded_at column missing on this DB, the query would have errored;
          // here we further skip rows already-graded-via-feedback as a safety net.
          if (u.feedback_text) continue;
          const cid = pickCourseId(u.assignment);
          if (!cid) continue;
          const entry = courseById.get(cid);
          if (!entry) continue;
          entry.agg.needs += 1;
        }
      }

      // ── Needs: past-due ─────────────────────────────────────────────────
      if (!pastDueRes.error && pastDueRes.data) {
        const pdr = pastDueRes.data as unknown as PastDueRow[];
        for (const p of pdr) {
          const entry = courseById.get(p.course_id);
          if (!entry) continue;
          entry.agg.needs += 1;
        }
      }

      // ── Materialize final rows in course query order ────────────────────
      const out: CohortRow[] = [];
      for (const row of courseRows) {
        const entry = courseById.get(row.id);
        if (!entry) continue;
        const studentCount = row.course_memberships?.[0]?.count ?? 0;
        const avg =
          entry.agg.count > 0 ? entry.agg.sum / entry.agg.count : null;
        out.push({
          courseId: row.id,
          courseShortCode: row.short_code,
          courseName: row.name,
          studentCount,
          submissionsThisWeek: entry.agg.subs,
          avgEffectiveScore: avg,
          needsAttentionCount: entry.agg.needs,
        });
      }

      setRows(out);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId, domain]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}
