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
 * Data flow
 * ---------
 * The `useCohortSummary` query is owned by DashboardPage (it also feeds
 * the greeting-level StatRow) and arrives here via the `summary` prop —
 * one fetch, two consumers.
 *
 * Empty / loading
 * ---------------
 *  - Teacher has zero non-archived courses → render nothing.
 *  - Loading → 3 skeleton cards inside the collapsible body.
 *  - Teacher has cohorts but no activity → still render cards, with "No
 *    activity yet" in place of the avg-score pill. The whole point of the
 *    widget is to give her a stable scoreboard, not vanish when quiet.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type CohortRow, type UseCohortSummary } from "./useCohortSummary";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components";
import {
  loadCollapsed,
  saveCollapsed,
  REFRESH_DEBOUNCE_MS,
} from "./cohortSummaryHelpers";
import { CohortCard } from "./CohortCard";
import { CohortDrillDrawer } from "./CohortDrillDrawer";

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

// ─── Skeleton card ────────────────────────────────────────────────────────

function SkeletonCohortCard() {
  return (
    <div
      className="
        rounded-lg ring-1 ring-slate-200 dark:ring-slate-800
        bg-white/70 dark:bg-slate-900/40
        p-3.5 space-y-3
      "
    >
      <Skeleton className="h-4 w-3/4 rounded-lg" />
      <Skeleton className="h-3 w-2/3 rounded-lg" />
      <Skeleton className="h-7 w-20 rounded-lg" />
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────

interface CohortSummaryWidgetProps {
  /**
   * Cohort data owned by DashboardPage (which also feeds the StatRow) and
   * threaded down so the page issues the query exactly once.
   */
  summary: UseCohortSummary;
}

export function CohortSummaryWidget({ summary }: CohortSummaryWidgetProps) {
  const { rows, loading, error, refresh } = summary;
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
        bg-white dark:bg-slate-900/40 shadow-card
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
            flex items-center gap-2 min-h-[40px] px-1 py-1 rounded-lg
            text-left
            focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
          "
        >
          <ChevronIcon collapsed={collapsed} />
          <h2
            id="cohort-summary-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300"
          >
            Cohort summary
          </h2>
          {totalCohorts > 0 && (
            <span
              aria-label={`${totalCohorts} cohort${totalCohorts === 1 ? "" : "s"}`}
              className="
                inline-flex items-center justify-center min-w-[1.5rem] px-1.5
                h-5 rounded-full text-xs font-semibold tabular-nums
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
            w-10 h-10 rounded-lg
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
