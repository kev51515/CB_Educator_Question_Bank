/**
 * AssignmentsToolbar
 * ==================
 * Header + filter pills for the teacher Assignments page.
 *
 * Renders:
 *   - The page title block (serif title + subtitle).
 *   - The action buttons on the right (Select/Done pill + Create button).
 *   - The "All assignments" sub-header with Active / Archived / All filter
 *     pills (counts included).
 *
 * Behavior-preserving extraction from AssignmentsPage.tsx — owns no state.
 * The page passes in the current filter, counts, select-mode flag, and
 * callbacks for every interactive element.
 */
import type { ArchiveFilter } from "./assignmentsFilter";

interface FilterPillProps {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}

function FilterPill({ active, count, label, onClick }: FilterPillProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full min-h-[40px] md:min-h-0 inline-flex items-center px-3 py-2 md:py-1 text-xs font-medium ring-1 transition ${
        active
          ? "bg-indigo-600 text-white ring-indigo-600"
          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      {label}
      <span
        className={`ml-1.5 inline-block rounded-full px-1.5 text-[10px] ${
          active
            ? "bg-indigo-500/40 text-white"
            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export interface AssignmentsToolbarProps {
  totalCount: number;
  activeCount: number;
  archivedCount: number;
  /** Number of assignments with ≥1 attempt touched by a teacher in the
   *  last 7 days. Powers the "Recently graded" pill — only shown when > 0
   *  so a brand-new course doesn't surface a noisy empty filter. */
  recentlyGradedCount: number;
  filter: ArchiveFilter;
  onFilterChange: (next: ArchiveFilter) => void;
  /** Whether the bulk-select mode is currently on. */
  selectMode: boolean;
  /** Whether the Select / Done pill should be shown at all. */
  canSelect: boolean;
  onEnterSelectMode: () => void;
  onExitSelectMode: () => void;
  onCreate: () => void;
}

export function AssignmentsToolbar({
  totalCount,
  activeCount,
  archivedCount,
  recentlyGradedCount,
  filter,
  onFilterChange,
  selectMode,
  canSelect,
  onEnterSelectMode,
  onExitSelectMode,
  onCreate,
}: AssignmentsToolbarProps): JSX.Element {
  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          {/* Serif page title per the Modules/Gradebook convention — the
              course name already lives in the breadcrumb, so it isn't
              repeated here. */}
          <h1 className="page-title text-2xl font-bold text-slate-900 dark:text-slate-100">
            Assignments
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Publish tests to this course and review results.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSelect && (
            selectMode ? (
              <button
                type="button"
                onClick={onExitSelectMode}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-400 dark:ring-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnterSelectMode}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Select
              </button>
            )
          )}
          <button
            type="button"
            onClick={onCreate}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Create assignment
          </button>
        </div>
      </header>

      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <h2
          id="assignments-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          All assignments
        </h2>
        <div className="flex items-center gap-2" role="group" aria-label="Filter assignments">
          <FilterPill
            active={filter === "active"}
            count={activeCount}
            label="Active"
            onClick={() => onFilterChange("active")}
          />
          <FilterPill
            active={filter === "archived"}
            count={archivedCount}
            label="Archived"
            onClick={() => onFilterChange("archived")}
          />
          <FilterPill
            active={filter === "all"}
            count={totalCount}
            label="All"
            onClick={() => onFilterChange("all")}
          />
          {recentlyGradedCount > 0 && (
            <FilterPill
              active={filter === "recently-graded"}
              count={recentlyGradedCount}
              label="Recently graded"
              onClick={() => onFilterChange("recently-graded")}
            />
          )}
        </div>
      </div>
    </>
  );
}
