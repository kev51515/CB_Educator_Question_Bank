/**
 * TeacherCellTriage
 * =================
 * Educator drill-down content (decision 2A, docs/JOURNEY_VIEW.md): mastery
 * distribution bar, the short needs-attention list, and two actions — open
 * the assignment, or Nudge exactly those students (DM via open_thread_with
 * + messages insert, handled by the parent). Rendered inside JourneyGrid's
 * anchored popover shell.
 */
import { useState } from "react";
import type { JourneyCell } from "./buildJourney";

export interface TriageStudent {
  id: string;
  name: string;
  /** Best score 0–100, or null = not started. */
  score: number | null;
}

export interface TriageDetail {
  sealed: number;
  proficient: number;
  attempted: number;
  notStarted: number;
  submitted: number;
  total: number;
  avg: number | null;
  /** Low scores first, then not-started — capped by the caller. */
  needsAttention: TriageStudent[];
}

interface TeacherCellTriageProps {
  cell: JourneyCell;
  detail: TriageDetail;
  onOpenAssignment: () => void;
  /** Send the nudge DMs; resolves with the number actually sent. */
  onNudge: (students: TriageStudent[]) => Promise<number>;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Segment({
  count,
  total,
  className,
}: {
  count: number;
  total: number;
  className: string;
}): JSX.Element | null {
  if (count <= 0 || total <= 0) return null;
  return (
    <div
      className={className}
      style={{ width: `${(count / total) * 100}%` }}
    />
  );
}

export function TeacherCellTriage({
  cell,
  detail,
  onOpenAssignment,
  onNudge,
}: TeacherCellTriageProps): JSX.Element {
  const [nudging, setNudging] = useState(false);
  const [nudged, setNudged] = useState(false);
  const d = detail;

  const legend: Array<{ n: number; label: string; swatch: string }> = [
    { n: d.sealed, label: "sealed", swatch: "journey-seal border" },
    {
      n: d.proficient,
      label: "proficient",
      swatch: "bg-indigo-600 dark:bg-indigo-500",
    },
    {
      n: d.attempted,
      label: "attempted",
      swatch: "bg-indigo-200 dark:bg-indigo-900",
    },
    {
      n: d.notStarted,
      label: "not started",
      swatch:
        "bg-slate-100 dark:bg-slate-800 ring-1 ring-inset ring-slate-200 dark:ring-slate-700",
    },
  ];

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {d.submitted}/{d.total} submitted
        {d.avg !== null ? ` · class avg ${Math.round(d.avg)}%` : ""}
      </p>
      <h4 className="page-title mt-0.5 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
        {cell.title}
      </h4>

      <div
        className="mt-2.5 flex h-3 rounded-full overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700"
        role="img"
        aria-label={`${d.sealed} sealed, ${d.proficient} proficient, ${d.attempted} attempted, ${d.notStarted} not started`}
      >
        <Segment count={d.sealed} total={d.total} className="journey-seal border-0" />
        <Segment count={d.proficient} total={d.total} className="bg-indigo-600 dark:bg-indigo-500" />
        <Segment count={d.attempted} total={d.total} className="bg-indigo-200 dark:bg-indigo-900" />
        <Segment count={d.notStarted} total={d.total} className="bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {legend
          .filter((s) => s.n > 0)
          .map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300"
            >
              <span aria-hidden className={`h-2 w-2 rounded-sm ${s.swatch}`} />
              <span className="tabular-nums font-semibold">{s.n}</span> {s.label}
            </span>
          ))}
      </div>

      {d.needsAttention.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Needs attention
          </p>
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            {d.needsAttention.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 py-1.5 text-xs text-slate-700 dark:text-slate-200"
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-[9px] font-bold text-indigo-700 dark:text-indigo-300"
                >
                  {initials(s.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span
                  className={`tabular-nums ${
                    s.score === null
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {s.score === null ? "not started" : `${Math.round(s.score)}% · retake`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onOpenAssignment}
          className="flex-1 min-h-[36px] rounded-lg px-3 text-xs font-semibold ring-1 ring-slate-300 dark:ring-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 motion-safe:transition-colors"
        >
          Open assignment
        </button>
        {d.needsAttention.length > 0 && (
          <button
            type="button"
            disabled={nudging || nudged}
            onClick={() => {
              setNudging(true);
              void onNudge(d.needsAttention).then((sent) => {
                setNudging(false);
                if (sent > 0) setNudged(true);
              });
            }}
            className="flex-1 min-h-[36px] rounded-lg px-3 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white motion-safe:transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {nudged
              ? "Nudged"
              : nudging
                ? "Sending…"
                : `Nudge ${d.needsAttention.length} student${d.needsAttention.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    </div>
  );
}
