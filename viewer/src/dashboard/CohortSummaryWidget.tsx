/**
 * CohortSummaryWidget
 * ===================
 * Small scoreboard widget on the staff Dashboard. Sits BELOW the
 * NeedsAttentionPanel (which is triage — concrete rows of work waiting on
 * Maya) and ABOVE the courses grid (the jump-into-a-class surface).
 *
 * Each card shows one cohort:
 *   • Course name (links to the course modules page — Canvas-style default
 *     landing).
 *   • Student count + submissions this week.
 *   • Avg effective score over the last 30 days, color-coded:
 *       ≥80 emerald · 70–79 indigo · 50–69 amber · <50 rose · no data slate
 *   • Optional "Needs N" pill in the upper-right when there are ungraded
 *     or past-due items; clicking scrolls the dashboard to the triage panel.
 *
 * Persistence
 * -----------
 * Collapse state is stored at `dashboard.cohortSummary.collapsed`. We do not
 * persist any other widget state — refresh and per-card visibility are
 * intentionally ephemeral.
 *
 * Empty / loading
 * ---------------
 *  - teacherId has zero non-archived courses → render nothing.
 *  - Loading → 3 skeleton cards inside the collapsible body.
 *  - Teacher has cohorts but no activity → still render cards, with "No
 *    activity yet" in place of the avg-score pill. The whole point of the
 *    widget is to give her a stable scoreboard, not vanish when quiet.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { useCohortSummary, type CohortRow } from "./useCohortSummary";
import { courseModulesPath, courseStudentProfilePath } from "../lib/routes";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { useToast } from "../components";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { supabase } from "../lib/supabase";

const COLLAPSE_KEY = "dashboard.cohortSummary.collapsed";
const REFRESH_DEBOUNCE_MS = 1000;

// ─── localStorage helpers ─────────────────────────────────────────────────

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    if (raw === null) return false;
    return raw === "true";
  } catch {
    return false;
  }
}

function saveCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? "true" : "false");
  } catch {
    // localStorage unavailable (Safari private mode etc.) — silent.
  }
}

// ─── Small primitives ─────────────────────────────────────────────────────

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
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
      className={`transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={spinning ? "animate-spin" : ""}
    >
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <polyline points="16 8 21 8 21 3" />
      <polyline points="8 16 3 16 3 21" />
    </svg>
  );
}

// ─── Score pill ───────────────────────────────────────────────────────────

interface ScorePillProps {
  value: number | null;
}

function ScorePill({ value }: ScorePillProps) {
  if (value === null) {
    return (
      <span
        className="
          inline-flex items-center gap-1
          px-2 py-0.5 rounded-full text-[11px] font-medium
          bg-slate-100 text-slate-600
          dark:bg-slate-800 dark:text-slate-300
        "
        title="No graded attempts in the last 30 days"
      >
        No activity yet
      </span>
    );
  }
  const rounded = Math.round(value);
  let cls = "";
  if (value >= 80) {
    cls =
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  } else if (value >= 70) {
    cls =
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200";
  } else if (value >= 50) {
    cls =
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  } else {
    cls = "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}
      title="Average score over the last 30 days"
    >
      Avg {rounded}%
    </span>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────

function SkeletonCohortCard() {
  return (
    <div
      className="
        rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-800
        bg-white/70 dark:bg-slate-900/40
        p-3 space-y-3
      "
    >
      <Skeleton className="h-4 w-3/4 rounded" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

// ─── Drill drawer: per-student data ───────────────────────────────────────

/**
 * One row of the "Top 5 most active students (last 30d)" list.
 * Ranking rule: order by `attempts` desc (engagement signal), ties broken
 * by avgEffectiveScore desc so the more accomplished student lists first.
 */
interface TopStudentRow {
  studentId: string;
  displayName: string;
  attempts: number;
  avgEffectiveScore: number | null;
}

interface CohortDrillState {
  loading: boolean;
  error: string | null;
  topStudents: TopStudentRow[];
}

interface DrillAttemptRow {
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

function pickStudent(
  embedded: DrillAttemptRow["student"],
): { id: string; display_name: string | null; email: string | null } | null {
  if (!embedded) return null;
  if (Array.isArray(embedded)) return embedded[0] ?? null;
  return embedded;
}

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
}

/**
 * Lazy hook — only fires when `cohort` is set. Aborts in-flight work on
 * close via a token ref (Supabase JS doesn't accept AbortSignal cleanly
 * across all builds; the token pattern mirrors useCourseOverview).
 */
function useCohortDrill(cohort: CohortRow | null): CohortDrillState {
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

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

// ─── Drawer ───────────────────────────────────────────────────────────────

interface CohortDrillDrawerProps {
  cohort: CohortRow | null;
  onClose: () => void;
  onNeedsClick: () => void;
}

function CloseIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CohortDrillDrawer({
  cohort,
  onClose,
  onNeedsClick,
}: CohortDrillDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = cohort !== null;
  useFocusTrap(dialogRef, open);

  const drill = useCohortDrill(cohort);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !cohort) return null;

  const studentsLabel = cohort.studentCount === 1 ? "student" : "students";
  const avgLabel = fmtPct(cohort.avgEffectiveScore);

  return (
    <div
      className="fixed inset-0 z-50"
      aria-hidden={false}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close drawer"
        tabIndex={-1}
        onClick={onClose}
        className="
          absolute inset-0
          bg-slate-900/40 dark:bg-slate-950/60
          motion-safe:transition-opacity
        "
      />
      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cohort-drill-heading"
        onClick={(e) => e.stopPropagation()}
        className="
          absolute inset-0 sm:inset-y-0 sm:right-0 sm:left-auto
          w-full sm:w-[420px]
          bg-white dark:bg-slate-950
          border-l-4 border-indigo-500
          shadow-2xl
          flex flex-col
          motion-safe:transition-transform
          focus:outline-none
        "
      >
        {/* Header */}
        <div
          className="
            flex items-start justify-between gap-3
            px-4 sm:px-5 py-4
            border-b border-slate-200 dark:border-slate-800
          "
        >
          <div className="min-w-0">
            <h2
              id="cohort-drill-heading"
              className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
              title={cohort.courseName}
            >
              {cohort.courseName}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {cohort.studentCount} {studentsLabel} · avg {avgLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-autofocus
            className="
              inline-flex items-center justify-center
              w-10 h-10 rounded-md
              text-slate-600 dark:text-slate-300
              hover:bg-slate-100 dark:hover:bg-slate-800
              focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              transition-colors
            "
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          {/* Needs-attention callout */}
          {cohort.needsAttentionCount > 0 && (
            <div
              className="
                flex items-center justify-between gap-3
                rounded-lg px-3 py-2
                bg-rose-50 dark:bg-rose-950/40
                ring-1 ring-rose-200 dark:ring-rose-900
              "
            >
              <span className="inline-flex items-center gap-2 text-xs">
                <span
                  className="
                    inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold
                    bg-rose-100 text-rose-800
                    dark:bg-rose-900/40 dark:text-rose-200
                  "
                >
                  Needs {cohort.needsAttentionCount}
                </span>
                <span className="text-rose-700 dark:text-rose-300">
                  items waiting on you
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  // Defer scroll until after the drawer unmounts so focus
                  // restoration doesn't fight the scroll target.
                  requestAnimationFrame(() => onNeedsClick());
                }}
                className="
                  text-xs font-semibold
                  text-rose-700 dark:text-rose-300
                  hover:underline
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500
                  rounded
                "
              >
                View triage →
              </button>
            </div>
          )}

          {/* Top 5 students */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Top 5 most active students (last 30d)
            </h3>
            <div className="mt-2">
              {drill.loading ? (
                <SkeletonRows count={5} rowClassName="h-12" />
              ) : drill.error ? (
                <div
                  role="alert"
                  className="
                    rounded-lg px-3 py-2 text-xs
                    bg-rose-50 dark:bg-rose-950/40
                    text-rose-700 dark:text-rose-300
                    ring-1 ring-rose-200 dark:ring-rose-900
                    flex items-center justify-between gap-3
                  "
                >
                  <span className="min-w-0 truncate">
                    Couldn't load: {drill.error}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      (
                        drill as CohortDrillState & { __retry?: () => void }
                      ).__retry?.()
                    }
                    className="
                      text-xs font-semibold underline
                      hover:no-underline
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500
                      rounded
                    "
                  >
                    Retry
                  </button>
                </div>
              ) : drill.topStudents.length === 0 ? (
                <div
                  className="
                    rounded-lg px-3 py-6 text-center text-xs
                    bg-slate-50 dark:bg-slate-900/40
                    text-slate-600 dark:text-slate-400
                    ring-1 ring-slate-200 dark:ring-slate-800
                  "
                >
                  No attempts in this cohort over the last 30 days.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {drill.topStudents.map((s, i) => (
                    <li key={s.studentId}>
                      <Link
                        to={courseStudentProfilePath(
                          cohort.courseShortCode,
                          s.studentId,
                        )}
                        onClick={onClose}
                        className="
                          flex items-center gap-3
                          rounded-lg px-3 py-2 min-h-[40px]
                          ring-1 ring-slate-200/60 dark:ring-slate-800
                          bg-white/80 dark:bg-slate-900/40
                          hover:ring-indigo-300 dark:hover:ring-indigo-700
                          hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                          transition-colors
                        "
                      >
                        <span
                          aria-hidden
                          className="
                            inline-flex items-center justify-center
                            w-6 h-6 rounded-full text-[11px] font-semibold
                            bg-indigo-100 text-indigo-800
                            dark:bg-indigo-900/40 dark:text-indigo-200
                            shrink-0
                          "
                        >
                          {i + 1}
                        </span>
                        <span
                          className="flex-1 min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100"
                          title={s.displayName}
                        >
                          {s.displayName}
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
                          {s.attempts}{" "}
                          {s.attempts === 1 ? "attempt" : "attempts"}
                        </span>
                        <span
                          className="
                            inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold
                            bg-slate-100 text-slate-700
                            dark:bg-slate-800 dark:text-slate-200
                            shrink-0
                          "
                          title="Average effective score (last 30 days)"
                        >
                          {fmtPct(s.avgEffectiveScore)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────

interface CohortCardProps {
  row: CohortRow;
  onNeedsClick: () => void;
  onOpenDrill: (row: CohortRow) => void;
}

function ChevronRightIcon() {
  return (
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
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function CohortCard({ row, onNeedsClick, onOpenDrill }: CohortCardProps) {
  const studentsLabel = row.studentCount === 1 ? "student" : "students";
  const subsLabel = row.submissionsThisWeek === 1 ? "this week" : "this week";

  return (
    <div
      className="
        relative group
        rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-800
        bg-white/80 dark:bg-slate-900/40
        hover:ring-indigo-200 dark:hover:ring-indigo-800
        transition-colors
      "
    >
      {row.needsAttentionCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onNeedsClick();
          }}
          aria-label={`${row.needsAttentionCount} items need attention — scroll to triage`}
          title="Items waiting on you"
          className="
            absolute top-2 right-2 z-10
            inline-flex items-center gap-1
            min-h-[40px] px-2.5 py-1
            rounded-full text-[11px] font-semibold
            bg-rose-100 text-rose-800
            dark:bg-rose-900/40 dark:text-rose-200
            hover:bg-rose-200 dark:hover:bg-rose-900/60
            focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500
            transition-colors
          "
        >
          Needs {row.needsAttentionCount}
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpenDrill(row)}
        aria-label={`View ${row.courseName} cohort details`}
        className="
          block w-full text-left p-3 space-y-2
          rounded-xl
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        "
      >
        <div className="flex items-start justify-between gap-2">
          <h3
            className="
              text-sm font-semibold
              text-slate-900 dark:text-slate-100
              truncate pr-16
            "
            title={row.courseName}
          >
            {row.courseName}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="
              inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium
              bg-slate-100 text-slate-700
              dark:bg-slate-800 dark:text-slate-200
            "
          >
            {row.studentCount} {studentsLabel}
          </span>
          <span
            className="
              inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium
              bg-slate-100 text-slate-700
              dark:bg-slate-800 dark:text-slate-200
            "
          >
            {row.submissionsThisWeek} {subsLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <ScorePill value={row.avgEffectiveScore} />
          <span
            className="
              inline-flex items-center gap-1 text-[11px] font-medium
              text-slate-500 dark:text-slate-400
              opacity-0 group-hover:opacity-100
              motion-safe:transition-opacity
            "
            aria-hidden
          >
            View details
            <ChevronRightIcon />
          </span>
        </div>
      </button>
      <Link
        to={courseModulesPath(row.courseShortCode)}
        onClick={(e) => e.stopPropagation()}
        className="
          block px-3 py-1.5 text-[11px] font-medium
          text-indigo-700 dark:text-indigo-300
          border-t border-slate-200/60 dark:border-slate-800
          hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
          rounded-b-xl
          transition-colors
        "
      >
        Open modules →
      </Link>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────

interface CohortSummaryWidgetProps {
  teacherId: string;
}

export function CohortSummaryWidget({ teacherId }: CohortSummaryWidgetProps) {
  const { rows, loading, error, refresh } = useCohortSummary(teacherId);
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(0);
  const [openCohortId, setOpenCohortId] = useState<string | null>(null);
  const toast = useToast();

  const openCohort = useMemo(
    () => rows.find((r) => r.courseId === openCohortId) ?? null,
    [rows, openCohortId],
  );

  const handleOpenDrill = useCallback((row: CohortRow) => {
    setOpenCohortId(row.courseId);
  }, []);

  const handleCloseDrill = useCallback(() => {
    setOpenCohortId(null);
  }, []);

  useEffect(() => {
    saveCollapsed(collapsed);
  }, [collapsed]);

  const totalCohorts = rows.length;

  const handleRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshAt < REFRESH_DEBOUNCE_MS) {
      return;
    }
    setLastRefreshAt(now);
    setRefreshing(true);
    try {
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't refresh";
      toast.error("Couldn't refresh", msg);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, lastRefreshAt, toast]);

  const handleNeedsClick = useCallback(() => {
    if (typeof document === "undefined") return;
    const target = document.getElementById("needs-attention-heading");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // Fallback: scroll to top of page where NeedsAttentionPanel mounts.
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const skeletons = useMemo(
    () => [0, 1, 2].map((i) => <SkeletonCohortCard key={i} />),
    [],
  );

  // Render nothing when the teacher has zero non-archived courses. Keeps the
  // dashboard tight for brand-new accounts and avoids a perpetually empty
  // widget. We DO render when there are courses but no activity — that's
  // the whole point of the scoreboard.
  if (!loading && !error && totalCohorts === 0) {
    return null;
  }

  const bodyId = "cohort-summary-body";

  return (
    <section
      aria-labelledby="cohort-summary-heading"
      className="
        rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800
        bg-white/70 dark:bg-slate-900/40
        p-4 sm:p-5
        space-y-3
      "
    >
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="
            flex items-center gap-2 min-h-[40px] px-1 py-1 rounded-md
            text-left
            focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
          "
        >
          <ChevronIcon collapsed={collapsed} />
          <h2
            id="cohort-summary-heading"
            className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200"
          >
            Cohort summary
          </h2>
          {totalCohorts > 0 && (
            <span
              aria-label={`${totalCohorts} cohort${totalCohorts === 1 ? "" : "s"}`}
              className="
                inline-flex items-center justify-center min-w-[1.5rem] px-1.5
                h-5 rounded-full text-xs font-semibold
                bg-slate-100 text-slate-700
                dark:bg-slate-800 dark:text-slate-200
              "
            >
              {totalCohorts}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh cohort summary"
          title="Refresh"
          className="
            inline-flex items-center justify-center
            w-10 h-10 rounded-md
            text-slate-600 dark:text-slate-300
            hover:bg-slate-100 dark:hover:bg-slate-800
            disabled:opacity-50 disabled:cursor-not-allowed
            focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            transition-colors
          "
        >
          <RefreshIcon spinning={refreshing} />
        </button>
      </header>

      {!collapsed && (
        <div id={bodyId}>
          {error ? (
            <div
              role="alert"
              className="
                rounded-lg px-3 py-2 text-xs
                bg-rose-50 dark:bg-rose-950/40
                text-rose-700 dark:text-rose-300
                ring-1 ring-rose-200 dark:ring-rose-900
              "
            >
              Couldn't load cohort summary: {error}
            </div>
          ) : loading ? (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {skeletons}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {rows.map((row) => (
                <CohortCard
                  key={row.courseId}
                  row={row}
                  onNeedsClick={handleNeedsClick}
                  onOpenDrill={handleOpenDrill}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <CohortDrillDrawer
        cohort={openCohort}
        onClose={handleCloseDrill}
        onNeedsClick={handleNeedsClick}
      />
    </section>
  );
}
