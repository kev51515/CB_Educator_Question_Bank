/**
 * PortfolioOverviewGrid
 * =====================
 * The students × leaf-items matrix shown on the Overview sub-tab of the
 * staff portfolio view. Each cell is a single-click chip that opens the
 * <SubmissionDetailDrawer /> for that (student, item) pair.
 *
 * Pure presentation — receives already-resolved status data via
 * `statusByPair` (computed by the parent page from
 * `portfolio_submissions` + per-item `due_at` for overdue detection). The
 * grid itself does NO DB queries.
 *
 * Header items (parents in the tree) are intentionally NOT columns — only
 * leaf items accept submissions. The parent page passes `leaves` (already
 * flattened from the tree) rather than the full tree.
 */
import type { PortfolioItem } from "./usePortfolio";
import type { RosterStudent } from "./useClassRoster";

export type CellStatus = "not_started" | "draft" | "submitted" | "overdue";

/**
 * Row shape returned from `portfolio_submissions` SELECT for the overview
 * grid. Re-declared here (rather than re-using a DB-layer type) because the
 * overview grid only cares about these four columns; the page passes raw
 * rows into `buildStatusMap` which derives per-cell status from
 * (server-recorded status, item due_at, current time).
 */
export interface OverviewSubmissionRow {
  item_id: string;
  student_id: string;
  status: string;
  submitted_at: string | null;
}

/**
 * Pure derivation of the (item, student) -> CellStatus map used by the
 * grid. Combines the server-side `portfolio_submissions` rows with each
 * leaf's `due_at` to flip stale drafts into "overdue", and fills missing
 * pairs as "not_started" or "overdue" depending on the due date.
 *
 * Extracted from CoursePortfolio's `loadOverview` so the grid file owns the
 * data shape it consumes. No DB call, no React state — pure function.
 */
export function buildStatusMap(
  leaves: readonly PortfolioItem[],
  roster: readonly RosterStudent[],
  rows: readonly OverviewSubmissionRow[],
  now: number = Date.now(),
): Record<string, CellStatus> {
  const itemDueById = new Map<string, string | null>(
    leaves.map((i) => [i.id, i.due_at]),
  );
  const map: Record<string, CellStatus> = {};
  for (const r of rows) {
    const key = `${r.item_id}:${r.student_id}`;
    if (r.status === "submitted") {
      map[key] = "submitted";
    } else {
      const due = itemDueById.get(r.item_id) ?? null;
      if (due && new Date(due).getTime() < now) {
        map[key] = "overdue";
      } else {
        map[key] = "draft";
      }
    }
  }
  for (const item of leaves) {
    for (const student of roster) {
      const key = `${item.id}:${student.student_id}`;
      if (!map[key]) {
        if (item.due_at && new Date(item.due_at).getTime() < now) {
          map[key] = "overdue";
        } else {
          map[key] = "not_started";
        }
      }
    }
  }
  return map;
}

export function studentLabel(s: RosterStudent): string {
  if (s.display_name) return s.display_name;
  return s.email || s.student_id;
}

function cellChipClass(status: CellStatus): string {
  switch (status) {
    case "submitted":
      return "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900";
    case "draft":
      return "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 ring-amber-200 dark:ring-amber-900";
    case "overdue":
      return "bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 ring-rose-200 dark:ring-rose-900";
    default:
      return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700";
  }
}

function cellLabel(status: CellStatus): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "draft":
      return "Draft";
    case "overdue":
      return "Overdue";
    default:
      return "Not started";
  }
}

export interface PortfolioOverviewGridProps {
  leaves: readonly PortfolioItem[];
  roster: readonly RosterStudent[];
  statusByPair: Record<string, CellStatus>;
  onCellClick: (student: RosterStudent, item: PortfolioItem) => void;
}

export function PortfolioOverviewGrid({
  leaves,
  roster,
  statusByPair,
  onCellClick,
}: PortfolioOverviewGridProps): JSX.Element {
  if (leaves.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Add items to the template first.
      </p>
    );
  }
  if (roster.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No students enrolled yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/85 dark:bg-slate-900/70">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900/40">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Student
            </th>
            {leaves.map((item) => (
              <th
                key={item.id}
                className="px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
              >
                {item.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roster.map((student) => (
            <tr
              key={student.student_id}
              className="border-t border-slate-100 dark:border-slate-800"
            >
              <td className="sticky left-0 z-10 bg-white/85 dark:bg-slate-900/70 px-3 py-2 text-slate-800 dark:text-slate-100 whitespace-nowrap">
                {studentLabel(student)}
              </td>
              {leaves.map((item) => {
                const key = `${item.id}:${student.student_id}`;
                const status = statusByPair[key] ?? "not_started";
                return (
                  <td key={item.id} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onCellClick(student, item)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 hover:opacity-80 transition ${cellChipClass(
                        status,
                      )}`}
                    >
                      {cellLabel(status)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
