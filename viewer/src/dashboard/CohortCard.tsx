import { Link } from "react-router-dom";
import { type CohortRow } from "./useCohortSummary";
import { courseModulesPath } from "@/lib/routes";

// ─── Average score (ledger numeral) ───────────────────────────────────────
//
// Ivy-ledger anatomy: big display numeral + quiet label on one baseline.
// Deliberately NOT `.ceremonial` — the dashboard's single gold numeral is
// the 30-day average up in StatRow; per-cohort averages stay in plain ink
// so the screen respects the two-gold cap. `font-display` is a safe no-op
// in the classic theme.

interface ScoreLineProps {
  value: number | null;
}

function ScoreLine({ value }: ScoreLineProps) {
  if (value === null) {
    return (
      <span
        className="text-[11px] italic text-slate-500 dark:text-slate-400"
        title="No graded attempts in the last 30 days"
      >
        No scored activity yet
      </span>
    );
  }
  const rounded = Math.round(value);
  return (
    <span
      className="inline-flex items-baseline gap-1.5 min-w-0"
      title="Average score over the last 30 days"
    >
      <span className="font-display text-[26px] font-medium leading-none tabular-nums text-slate-900 dark:text-slate-100">
        {rounded}%
      </span>
      <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
        avg · last 30 days
      </span>
    </span>
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
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function CohortCard({ row, onNeedsClick, onOpenDrill }: CohortCardProps) {
  const studentsLabel = row.studentCount === 1 ? "student" : "students";
  const subsLabel =
    row.submissionsThisWeek === 1 ? "submission" : "submissions";

  return (
    <div
      className="
        relative group min-w-0
        rounded-lg ring-1 ring-slate-200 dark:ring-slate-800
        bg-white dark:bg-slate-900/40
        hover:ring-slate-300 dark:hover:ring-slate-700
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
            rounded-full text-[11px] font-semibold tabular-nums
            bg-amber-100 text-amber-800
            dark:bg-amber-900/40 dark:text-amber-200
            hover:bg-amber-200 dark:hover:bg-amber-900/60
            focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500
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
          block w-full text-left p-3.5
          rounded-lg
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        "
      >
        <h3
          className="
            min-w-0
            text-sm font-semibold
            text-slate-900 dark:text-slate-100
            truncate pr-16
          "
          title={row.courseName}
        >
          {row.courseName}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
          {row.studentCount} {studentsLabel} · {row.submissionsThisWeek}{" "}
          {subsLabel} this week
        </p>
        <div className="mt-3 flex items-end justify-between gap-2">
          <ScoreLine value={row.avgEffectiveScore} />
          <span
            className="
              inline-flex items-center gap-1 text-[11px] font-medium
              text-slate-500 dark:text-slate-400
              opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
              motion-safe:transition-opacity
              whitespace-nowrap
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
          block px-3.5 py-2 text-[11px] font-medium
          text-indigo-700 dark:text-indigo-300
          border-t border-slate-200 dark:border-slate-800
          hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
          rounded-b-lg
          transition-colors
        "
      >
        Open modules →
      </Link>
    </div>
  );
}
