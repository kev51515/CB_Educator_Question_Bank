/**
 * AnswerActions
 * =============
 * The action button row underneath the answer/SPR display in `Detail`:
 *   - Primary "Show answer" / "Hide answer · {letter}" button.
 *   - Secondary "Show rationale" / "Hide rationale" / "No rationale" button.
 *   - Optional confidence rating (right-aligned, only when `onRateConfidence`
 *     is provided).
 *
 * Owns no state — every label and disabled flag is derived from props.
 * Extracted from `Detail.tsx` for structural clarity.
 */
import { ConfidenceRating } from "@/components/ConfidenceRating";

interface AnswerActionsProps {
  /** Whether the answer is currently revealed. */
  showAnswer: boolean;
  /** Whether the rationale is currently revealed. */
  showRationale: boolean;
  /** Whether the question has any answer to show (MCQ or SPR). */
  canShowAnswer: boolean;
  /** Whether the question has rationale content. */
  hasRationale: boolean;
  /** Whether the question is an MCQ with a known correct option. */
  hasMcqAnswer: boolean;
  /** Letter ("A".."E") of the correct MCQ choice (empty for SPR). */
  correctLetter: string;
  /** Toggle answer visibility. */
  onToggleAnswer: () => void;
  /** Toggle rationale visibility. */
  onToggleRationale: () => void;
  /** Question id (passed to ConfidenceRating). */
  questionId: string;
  /** Optional confidence rating value (0..5). */
  confidenceRating?: number;
  /** Optional handler — when omitted, the rating UI is hidden entirely. */
  onRateConfidence?: (rating: number) => void;
}

export function AnswerActions({
  showAnswer,
  showRationale,
  canShowAnswer,
  hasRationale,
  hasMcqAnswer,
  correctLetter,
  onToggleAnswer,
  onToggleRationale,
  questionId,
  confidenceRating,
  onRateConfidence,
}: AnswerActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 mb-8">
      <button
        onClick={onToggleAnswer}
        disabled={!canShowAnswer && !hasRationale}
        className="px-4 py-2 text-[13px] font-medium rounded-lg bg-accent-600 hover:bg-accent-700 disabled:bg-ink-300 disabled:cursor-not-allowed text-white shadow-card hover:shadow-md transition-all duration-150 focus-ring"
      >
        {showAnswer
          ? `Hide answer${hasMcqAnswer ? ` · ${correctLetter}` : ""}`
          : "Show answer"}
      </button>
      <button
        onClick={onToggleRationale}
        disabled={!hasRationale}
        className="px-4 py-2 text-[13px] font-medium rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-ink-200 transition-colors focus-ring"
      >
        {showRationale ? "Hide rationale" : hasRationale ? "Show rationale" : "No rationale"}
      </button>
      {onRateConfidence && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px] text-ink-400">Confidence:</span>
          <ConfidenceRating
            questionId={questionId}
            rating={confidenceRating ?? 0}
            onRate={(_id, rating) => onRateConfidence(rating)}
          />
        </div>
      )}
    </div>
  );
}
