interface StickyActionsProps {
  visible: boolean;
  showAnswer: boolean;
  showRationale: boolean;
  onToggleAnswer: () => void;
  onToggleRationale: () => void;
  canShowAnswer: boolean;
  hasRationale: boolean;
  correctLetter: string;
}

export function StickyActions({
  visible,
  showAnswer,
  showRationale,
  onToggleAnswer,
  onToggleRationale,
  canShowAnswer,
  hasRationale,
  correctLetter,
}: StickyActionsProps): JSX.Element | null {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleAnswer}
        disabled={!canShowAnswer}
        title={showAnswer ? "Hide answer (A)" : "Show answer (A)"}
        aria-label={showAnswer ? "Hide answer" : "Show answer"}
        aria-pressed={showAnswer}
        className={
          "text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed " +
          (showAnswer
            ? "bg-accent-600 text-white"
            : "border border-ink-200 text-ink-700 hover:bg-ink-50")
        }
      >
        {showAnswer && correctLetter ? `A · ${correctLetter}` : "A"}
      </button>
      <button
        type="button"
        onClick={onToggleRationale}
        disabled={!hasRationale}
        title={showRationale ? "Hide rationale (R)" : "Show rationale (R)"}
        aria-label={showRationale ? "Hide rationale" : "Show rationale"}
        aria-pressed={showRationale}
        className={
          "text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed " +
          (showRationale
            ? "bg-accent-600 text-white"
            : "border border-ink-200 text-ink-700 hover:bg-ink-50")
        }
      >
        R
      </button>
    </div>
  );
}
