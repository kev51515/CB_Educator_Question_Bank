import { useEffect, useRef, useState } from "react";
import { type CohortRow } from "./useCohortSummary";
import { supabase } from "../lib/supabase";

export const COLLAPSE_KEY = "dashboard.cohortSummary.collapsed";
export const REFRESH_DEBOUNCE_MS = 1000;

// ─── localStorage helpers ─────────────────────────────────────────────────

export function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    if (raw === null) return false;
    return raw === "true";
  } catch {
    return false;
  }
}

export function saveCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? "true" : "false");
  } catch {
    // localStorage unavailable (Safari private mode etc.) — silent.
  }
}

// ─── Drill drawer: per-student data ───────────────────────────────────────

/**
 * One row of the "Top 5 most active students (last 30d)" list.
 * Ranking rule: order by `attempts` desc (engagement signal), ties broken
 * by avgEffectiveScore desc so the more accomplished student lists first.
 */
export interface TopStudentRow {
  studentId: string;
  displayName: string;
  attempts: number;
  avgEffectiveScore: number | null;
}

export interface CohortDrillState {
  loading: boolean;
  error: string | null;
  topStudents: TopStudentRow[];
}

export interface DrillAttemptRow {
  student_id: string | null;
  effective_score?: number | string | null;
  score_percent?: number | string | null;
  assignment_id: string;
  assignment?:
    | { course_id: string }
    | { course_id: string }[]
    | null;
  student?:
    | { id: string; display_name: string | null; email: string | null }
    | { id: string; display_name: string | null; email: string | null }[]
    | null;
}

export function pickStudent(
  embedded: DrillAttemptRow["student"],
): { id: string; display_name: string | null; email: string | null } | null {
  if (!embedded) return null;
  if (Array.isArray(embedded)) return embedded[0] ?? null;
  return embedded;
}

export function fmtPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
}

/**
 * Lazy hook — only fires when `cohort` is set. Aborts in-flight work on
 * close via a token ref (Supabase JS doesn't accept AbortSignal cleanly
 * across all builds; the token pattern mirrors useCourseOverview).
 */
export function useCohortDrill(cohort: CohortRow | null): CohortDrillState {
  const [state, setState] = useState<CohortDrillState>({
    loading: false,
    error: null,
    topStudents: [],
  });
  const tokenRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!cohort) {
      setState({ loading: false, error: null, topStudents: [] });
      return;
    }
    const myToken = ++tokenRef.current;
    setState({ loading: true, error: null, topStudents: [] });

    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    (async () => {
      try {
        // Step 1: assignment ids for this single course.
        const assignmentsRes = await supabase
          .from("assignments")
          .select("id")
          .eq("course_id", cohort.courseId);

        if (myToken !== tokenRef.current) return;
        if (assignmentsRes.error) {
          setState({
            loading: false,
            error: assignmentsRes.error.message,
            topStudents: [],
          });
          return;
        }
        const assignmentIds = (assignmentsRes.data ?? []).map(
          (a: { id: string }) => a.id,
        );
        if (assignmentIds.length === 0) {
          setState({ loading: false, error: null, topStudents: [] });
          return;
        }

        // Step 2: attempts in last 30d with student joined.
        // Primary: assignment_attempts_effective view (0056/0057).
        // Fallback: plain assignment_attempts + score_percent.
        const selectClause =
          "assignment_id, student_id, effective_score, submitted_at, " +
          "student:profiles!assignment_attempts_student_id_fkey(id, display_name, email)";

        let attempts: DrillAttemptRow[] = [];
        const primary = await supabase
          .from("assignment_attempts_effective")
          .select(selectClause)
          .not("submitted_at", "is", null)
          .gte("submitted_at", thirtyDaysAgo)
          .in("assignment_id", assignmentIds)
          .limit(2000);

        if (myToken !== tokenRef.current) return;

        if (primary.error) {
          // Fallback path
          const fallback = await supabase
            .from("assignment_attempts")
            .select(
              "assignment_id, student_id, score_percent, submitted_at, " +
                "student:profiles!assignment_attempts_student_id_fkey(id, display_name, email)",
            )
            .not("submitted_at", "is", null)
            .gte("submitted_at", thirtyDaysAgo)
            .in("assignment_id", assignmentIds)
            .limit(2000);

          if (myToken !== tokenRef.current) return;
          if (fallback.error) {
            setState({
              loading: false,
              error: fallback.error.message,
              topStudents: [],
            });
            return;
          }
          attempts = (fallback.data ?? []) as unknown as DrillAttemptRow[];
        } else {
          attempts = (primary.data ?? []) as unknown as DrillAttemptRow[];
        }

        // Group by student.
        const byStudent = new Map<
          string,
          {
            displayName: string;
            attempts: number;
            sum: number;
            count: number;
          }
        >();
        for (const a of attempts) {
          const sp = pickStudent(a.student);
          const sid = sp?.id ?? a.student_id;
          if (!sid) continue;
          const name =
            sp?.display_name?.trim() || sp?.email?.trim() || "Unknown student";
          let entry = byStudent.get(sid);
          if (!entry) {
            entry = { displayName: name, attempts: 0, sum: 0, count: 0 };
            byStudent.set(sid, entry);
          }
          entry.attempts += 1;
          const v =
            toNumber(a.effective_score) ?? toNumber(a.score_percent);
          if (v !== null) {
            entry.sum += v;
            entry.count += 1;
          }
        }

        const top: TopStudentRow[] = Array.from(byStudent.entries())
          .map(([studentId, entry]) => ({
            studentId,
            displayName: entry.displayName,
            attempts: entry.attempts,
            avgEffectiveScore:
              entry.count > 0 ? entry.sum / entry.count : null,
          }))
          .sort((a, b) => {
            if (b.attempts !== a.attempts) return b.attempts - a.attempts;
            const av = a.avgEffectiveScore ?? -1;
            const bv = b.avgEffectiveScore ?? -1;
            return bv - av;
          })
          .slice(0, 5);

        if (myToken !== tokenRef.current) return;
        setState({ loading: false, error: null, topStudents: top });
      } catch (err: unknown) {
        if (myToken !== tokenRef.current) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load cohort details.";
        setState({ loading: false, error: msg, topStudents: [] });
      }
    })();

    return () => {
      // Invalidate in-flight work for this cohort.
      tokenRef.current += 1;
    };
  }, [cohort, retryTick]);

  // Expose retry via state cycle — used by the error UI through a closure.
  (state as CohortDrillState & { __retry?: () => void }).__retry = () =>
    setRetryTick((t) => t + 1);
  return state;
}

export function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}
