/**
 * ComparePanel
 * ============
 * Side-by-side comparison of two mock-test attempts. Extracted from
 * MockTestHistoryPage.
 *
 * Wave 21D polish: each numeric row now surfaces a delta indicator
 * (↑ +N emerald / ↓ -N rose / — slate) next to attempt B, and the B
 * cell tints emerald-50 / rose-50 to make improvement vs. regression
 * legible at a glance. Non-numeric rows (e.g. Source) suppress the
 * delta. Delta is read out in each row's aria-label so screen-reader
 * users get the same signal — not color-only.
 */
import type { MockAttempt } from "./mockTestHistoryHelpers";
import { formatDateTime, formatDuration } from "./mockTestHistoryHelpers";

interface ComparePanelProps {
  a: MockAttempt;
  b: MockAttempt;
  onClose: () => void;
}

type DeltaDirection = "up" | "down" | "equal";

interface Delta {
  direction: DeltaDirection;
  /** Pre-formatted label, e.g. "↑ +7%", "↓ -1m 20s", "— No change". */
  label: string;
  /** Sentence fragment for aria-label, e.g. "up by 7%". */
  ariaFragment: string;
}

function buildDelta(
  aNum: number,
  bNum: number,
  format: (absDiff: number) => string,
): Delta {
  const diff = bNum - aNum;
  if (diff === 0) {
    return {
      direction: "equal",
      label: "— No change",
      ariaFragment: "no change",
    };
  }
  const abs = Math.abs(diff);
  const formatted = format(abs);
  if (diff > 0) {
    return {
      direction: "up",
      label: `↑ +${formatted}`,
      ariaFragment: `up by ${formatted}`,
    };
  }
  return {
    direction: "down",
    label: `↓ -${formatted}`,
    ariaFragment: `down by ${formatted}`,
  };
}

function CompareStatRow({
  label,
  aValue,
  bValue,
  delta,
}: {
  label: string;
  aValue: string;
  bValue: string;
  delta?: Delta;
}) {
  const tint =
    delta?.direction === "up"
      ? "bg-emerald-50 dark:bg-emerald-950/30"
      : delta?.direction === "down"
        ? "bg-rose-50 dark:bg-rose-950/30"
        : "";

  const deltaTextClass =
    delta?.direction === "up"
      ? "text-emerald-700 dark:text-emerald-300"
      : delta?.direction === "down"
        ? "text-rose-700 dark:text-rose-300"
        : "text-slate-500 dark:text-slate-400";

  const rowAria = delta
    ? `${label}: ${aValue} then ${bValue}, ${delta.ariaFragment}`
    : `${label}: ${aValue} then ${bValue}`;

  return (
    <div
      className="grid grid-cols-3 gap-3 py-2 border-t border-slate-100 dark:border-slate-800 text-sm motion-safe:transition-colors"
      role="row"
      aria-label={rowAria}
    >
      <div className="text-slate-500 dark:text-slate-400" role="rowheader">
        {label}
      </div>
      <div
        className="text-slate-800 dark:text-slate-100 font-medium"
        role="cell"
      >
        {aValue}
      </div>
      <div
        className={`flex flex-wrap items-baseline gap-x-2 rounded-md px-2 -mx-2 motion-safe:transition-colors ${tint}`}
        role="cell"
      >
        <span className="text-slate-800 dark:text-slate-100 font-medium">
          {bValue}
        </span>
        {delta ? (
          <span
            className={`text-xs font-semibold ${deltaTextClass}`}
            aria-hidden="true"
          >
            {delta.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ComparePanel({ a, b, onClose }: ComparePanelProps) {
  const scoreDelta = buildDelta(
    a.scorePercent,
    b.scorePercent,
    (n) => `${n}%`,
  );
  const correctDelta = buildDelta(a.score, b.score, (n) => `${n}`);
  const durationDelta = buildDelta(
    a.durationSeconds,
    b.durationSeconds,
    (n) => formatDuration(n),
  );

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
            Headline deltas vs. attempt A — green means improvement, red means regression.
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
      <div
        className="mt-3 grid grid-cols-3 gap-3 text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-300"
        role="row"
      >
        <div />
        <div role="columnheader">Attempt A · {formatDateTime(a.submittedAt)}</div>
        <div role="columnheader">Attempt B · {formatDateTime(b.submittedAt)}</div>
      </div>
      <div role="table" aria-label="Attempt comparison metrics">
        <CompareStatRow
          label="Score"
          aValue={`${a.scorePercent}%`}
          bValue={`${b.scorePercent}%`}
          delta={scoreDelta}
        />
        <CompareStatRow
          label="Correct / Total"
          aValue={`${a.score} / ${a.total}`}
          bValue={`${b.score} / ${b.total}`}
          delta={correctDelta}
        />
        <CompareStatRow
          label="Duration"
          aValue={formatDuration(a.durationSeconds)}
          bValue={formatDuration(b.durationSeconds)}
          delta={durationDelta}
        />
        <CompareStatRow
          label="Source"
          aValue={a.sourceLabel}
          bValue={b.sourceLabel}
        />
      </div>
    </section>
  );
}
