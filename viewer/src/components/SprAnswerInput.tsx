/**
 * SprAnswerInput
 * ==============
 * Display block for "student-produced response" (SPR) questions in `Detail`.
 *
 * SPR questions don't have multiple-choice options — they have a single
 * numeric/string answer. This component shows either:
 *   - the answer (when `showAnswer` is true and an answer key is available),
 *   - a "key not available" warning (when answer is missing in source data), or
 *   - a hint to press <kbd>A</kbd> to reveal.
 *
 * Pure presentational — owns no state. Extracted from Detail for modularity.
 */

interface SprAnswerInputProps {
  /** Whether the answer is currently revealed. */
  showAnswer: boolean;
  /** The SPR answer string (first entry of `question.keys`). May be empty. */
  sprAnswer: string;
}

export function SprAnswerInput({ showAnswer, sprAnswer }: SprAnswerInputProps) {
  const hasSprAnswer = sprAnswer.length > 0;
  return (
    <section className="mb-8">
      <div className="px-5 py-5 rounded-xl border border-ink-200 bg-ink-50">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
          Student-produced response
        </div>
        {showAnswer ? (
          hasSprAnswer ? (
            <div className="text-3xl font-mono text-accent-700">
              {sprAnswer}
            </div>
          ) : (
            <div className="text-[13.5px] text-amber-700">
              Answer key not available in source data.
            </div>
          )
        ) : (
          <div className="text-[13.5px] text-ink-500">
            Press <kbd>A</kbd> to reveal.
          </div>
        )}
      </div>
    </section>
  );
}
