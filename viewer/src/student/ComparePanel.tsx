/**
 * ComparePanel
 * ============
 * Side-by-side comparison of two mock-test attempts. Extracted from
 * MockTestHistoryPage. No behavior change.
 */
import type { MockAttempt } from "./mockTestHistoryHelpers";
import { formatDateTime, formatDuration } from "./mockTestHistoryHelpers";

interface ComparePanelProps {
  a: MockAttempt;
  b: MockAttempt;
  onClose: () => void;
}

function CompareStatRow({
  label,
  aValue,
  bValue,
}: {
  label: string;
  aValue: string;
  bValue: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-t border-slate-100 dark:border-slate-800 text-sm">
      <div className="text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-slate-800 dark:text-slate-100 font-medium">
        {aValue}
      </div>
      <div className="text-slate-800 dark:text-slate-100 font-medium">
        {bValue}
      </div>
    </div>
  );
}

export function ComparePanel({ a, b, onClose }: ComparePanelProps) {
  return (
    <section
      aria-label="Compare two attempts"
      className="rounded-2xl ring-1 ring-indigo-200 dark:ring-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
            Side-by-side comparison
          </h3>
          <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">
            Question-level diff is coming soon — for now, here's the headline stats.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg min-h-[40px] px-3 py-1.5 text-sm text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Close comparison"
        >
          Close
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
        <div />
        <div>Attempt A · {formatDateTime(a.submittedAt)}</div>
        <div>Attempt B · {formatDateTime(b.submittedAt)}</div>
      </div>
      <CompareStatRow
        label="Score"
        aValue={`${a.scorePercent}%`}
        bValue={`${b.scorePercent}%`}
      />
      <CompareStatRow
        label="Correct / Total"
        aValue={`${a.score} / ${a.total}`}
        bValue={`${b.score} / ${b.total}`}
      />
      <CompareStatRow
        label="Duration"
        aValue={formatDuration(a.durationSeconds)}
        bValue={formatDuration(b.durationSeconds)}
      />
      <CompareStatRow
        label="Source"
        aValue={a.sourceLabel}
        bValue={b.sourceLabel}
      />
    </section>
  );
}
