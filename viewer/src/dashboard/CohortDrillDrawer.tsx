import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { type CohortRow } from "./useCohortSummary";
import { courseStudentProfilePath } from "@/lib/routes";
import { SkeletonRows } from "@/components/Skeleton";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  useCohortDrill,
  fmtPct,
  type CohortDrillState,
} from "./cohortSummaryHelpers";

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

export function CohortDrillDrawer({
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
          ring-1 ring-slate-200 dark:ring-slate-800
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
