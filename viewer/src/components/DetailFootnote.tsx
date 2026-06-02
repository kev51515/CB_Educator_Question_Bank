/**
 * DetailFootnote
 * ==============
 * Footer strip at the bottom of the `Detail` pane. Shows:
 *   - A row of keyboard shortcut hints (J/K, A, R, ?).
 *   - Optional time-tracking summary (avg seconds × view count).
 *   - The internal `questionId` (monospace, dim, for support / bug reports).
 *
 * Pure presentational, no state. Extracted from Detail for modularity.
 */

interface DetailFootnoteProps {
  /** Internal id of the currently-displayed question. */
  questionId: string;
  /** Optional time stats — hidden if undefined or `count === 0`. */
  timeStats?: { count: number; totalSeconds: number; avgSeconds: number };
}

export function DetailFootnote({ questionId, timeStats }: DetailFootnoteProps) {
  return (
    <footer className="mt-12 pt-5 border-t border-ink-100 flex items-center justify-between gap-4 text-[11px] text-ink-400">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span><kbd>J</kbd>/<kbd>K</kbd> navigate</span>
        <span className="text-ink-200">·</span>
        <span><kbd>A</kbd> answer</span>
        <span className="text-ink-200">·</span>
        <span><kbd>R</kbd> rationale</span>
        <span className="text-ink-200">·</span>
        <span><kbd>?</kbd> help</span>
      </div>
      {timeStats && (
        <span className="text-[11px] text-ink-400 tabular-nums">
          {timeStats.count > 0
            ? `~${Math.round(timeStats.avgSeconds)}s avg · ${timeStats.count}× viewed`
            : ""}
        </span>
      )}
      <span
        className="font-mono text-[10.5px] text-ink-300 shrink-0"
        title="Internal id"
      >
        {questionId}
      </span>
    </footer>
  );
}
