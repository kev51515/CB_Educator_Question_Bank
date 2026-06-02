/**
 * AnswerOptions
 * =============
 * Renders the multiple-choice answer block for a question in `Detail`.
 *
 * Each option is displayed as a card with a circled letter (A, B, C, ...) and
 * the option HTML. When `showAnswer` is true and `correctIds` contains the
 * option id, the card is highlighted with an accent color and a small
 * "Correct" badge appears on the right.
 *
 * This is extracted from `Detail.tsx` for modularity — `Detail` still owns
 * the surrounding layout, font-size CSS var (`--qfs`), and the decision of
 * whether MCQ rendering is appropriate at all.
 */
import type { Question } from "@/types";
import { QuestionHtml } from "@/components/QuestionHtml";

const LETTERS = ["A", "B", "C", "D", "E"];

interface AnswerOptionsProps {
  /** The MCQ options to render (typically `question.answerOptions`). */
  options: NonNullable<Question["answerOptions"]>;
  /** Set of option ids that are correct (derived from `question.keys`). */
  correctIds: Set<string>;
  /** Whether the answer is currently revealed. */
  showAnswer: boolean;
}

export function AnswerOptions({ options, correctIds, showAnswer }: AnswerOptionsProps) {
  return (
    <section className="mb-8 space-y-2">
      {options.map((opt, i) => {
        const isCorrect = correctIds.has(opt.id);
        const highlight = showAnswer && isCorrect;
        return (
          <div
            key={opt.id}
            className={
              "group flex gap-4 px-5 py-3.5 rounded-xl border transition-all duration-150 " +
              (highlight
                ? "border-accent-400 bg-accent-50 shadow-card"
                : "border-ink-200 hover:border-accent-400/60 hover:shadow-card bg-white")
            }
          >
            <div
              className={
                "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-medium transition-colors " +
                (highlight
                  ? "bg-accent-600 text-white"
                  : "bg-ink-100 text-ink-700 group-hover:bg-ink-200")
              }
            >
              {LETTERS[i] ?? "?"}
            </div>
            <div
              className="flex-1 leading-relaxed"
              style={{ fontSize: "calc(var(--qfs) - 1px)" }}
            >
              <QuestionHtml html={opt.content} />
            </div>
            {highlight && (
              <span className="shrink-0 text-[11px] font-semibold text-accent-600 flex items-center gap-1">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Correct
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}
