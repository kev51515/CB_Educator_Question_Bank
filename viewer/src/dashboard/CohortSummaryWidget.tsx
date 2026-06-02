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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCohortSummary, type CohortRow } from "./useCohortSummary";
import { courseModulesPath } from "../lib/routes";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components";

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

// ─── Card ─────────────────────────────────────────────────────────────────

interface CohortCardProps {
  row: CohortRow;
  onNeedsClick: () => void;
}

function CohortCard({ row, onNeedsClick }: CohortCardProps) {
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
      <Link
        to={courseModulesPath(row.courseShortCode)}
        className="
          block p-3 space-y-2
          rounded-xl
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        "
      >
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
        <div>
          <ScorePill value={row.avgEffectiveScore} />
        </div>
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
  const toast = useToast();

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
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
