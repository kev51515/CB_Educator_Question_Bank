import { Link } from "react-router-dom";
import { type CohortRow } from "./useCohortSummary";
import { courseModulesPath } from "../lib/routes";

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

export function CohortCard({ row, onNeedsClick, onOpenDrill }: CohortCardProps) {
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
