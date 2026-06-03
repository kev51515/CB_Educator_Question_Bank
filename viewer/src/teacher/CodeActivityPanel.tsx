/**
 * CodeActivityPanel
 * =================
 * Roster strip summarising how the class has been entered:
 *   - shared class code: cumulative redemption count (durable; survives student
 *     removal), distinct redeemers, last-used, and a join vs. quick-start split,
 *     with an expandable per-redemption detail list (migration 0097).
 *   - personal student codes: M/N activated (derived from profiles.claimed_at,
 *     passed in from the roster).
 */
import { useState } from "react";
import { useCodeRedemptions } from "./useCodeRedemptions";
import { formatRelative } from "./studentProfileHelpers";

interface CodeActivityPanelProps {
  courseId: string;
  classCode: string;
  /** Managed seats whose owner has activated their personal code. */
  activatedSeats: number;
  /** Total managed seats (teacher-created logins). */
  totalSeats: number;
}

const METHOD_LABEL: Record<string, string> = {
  join: "Class code",
  quick_start: "Quick start",
};

export function CodeActivityPanel({
  courseId,
  classCode,
  activatedSeats,
  totalSeats,
}: CodeActivityPanelProps): JSX.Element {
  const { redemptions, stats, loading } = useCodeRedemptions(courseId);
  const [open, setOpen] = useState(false);

  const used = stats.total;
  const summary =
    used === 0
      ? "not used yet"
      : `used ${used}×` +
        ` · ${stats.students} student${stats.students === 1 ? "" : "s"}` +
        (stats.lastUsed ? ` · last ${formatRelative(stats.lastUsed)}` : "");

  return (
    <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span className="font-medium text-slate-500 dark:text-slate-400">Class code</span>
        <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {classCode}
        </span>
        <span aria-hidden className="text-slate-300 dark:text-slate-600">·</span>
        <span className={used === 0 ? "text-slate-400 dark:text-slate-500" : "font-medium text-emerald-700 dark:text-emerald-400"}>
          {loading ? "…" : summary}
        </span>
        {totalSeats > 0 && (
          <>
            <span aria-hidden className="text-slate-300 dark:text-slate-600">·</span>
            <span>
              {activatedSeats}/{totalSeats} personal code{totalSeats === 1 ? "" : "s"} activated
            </span>
          </>
        )}
        {used > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto rounded font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {open ? "Hide activity" : "View activity"}
          </button>
        )}
      </div>

      {open && used > 0 && (
        <ul className="mt-3 space-y-1.5">
          {redemptions.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md bg-white/70 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 px-3 py-1.5 text-xs"
            >
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {r.name_snapshot || "(unnamed)"}
                {r.student_id === null && (
                  <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                    (removed)
                  </span>
                )}
              </span>
              {r.email_snapshot && (
                <span className="text-slate-500 dark:text-slate-400 truncate">
                  {r.email_snapshot}
                </span>
              )}
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
                {METHOD_LABEL[r.method] ?? r.method}
              </span>
              <span
                className="ml-auto text-slate-400 dark:text-slate-500"
                title={new Date(r.created_at).toLocaleString()}
              >
                {formatRelative(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
