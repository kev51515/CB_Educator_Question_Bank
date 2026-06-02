/**
 * TestQuestionNav — compact question grid for the sidebar during a test.
 *
 * Buttons reflect three states: unanswered, answered, flagged. Current is
 * shown with a ring.
 */
import type { Letter, TestQuestion } from "../types";

interface TestQuestionNavProps {
  questions: TestQuestion[];
  currentIdx: number;
  answers: Record<string, Letter | null>;
  flagged: ReadonlySet<string>;
  onGoTo: (idx: number) => void;
}

export function TestQuestionNav({
  questions,
  currentIdx,
  answers,
  flagged,
  onGoTo,
}: TestQuestionNavProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Questions</p>
      <div className="flex flex-wrap gap-1.5" role="list" aria-label="Question navigation">
        {questions.map((q, idx) => {
          const isAnswered = answers[q.id] != null;
          const isFlagged = flagged.has(q.id);
          const isCurrent = idx === currentIdx;
          const stateClass = isFlagged
            ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
            : isAnswered
              ? "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700"
              : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
          const ringClass = isCurrent
            ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-950"
            : "";
          const stateLabel = isFlagged
            ? " (flagged)"
            : isAnswered
              ? " (answered)"
              : " (unanswered)";
          return (
            <button
              key={q.id}
              type="button"
              role="listitem"
              className={`w-8 h-8 text-xs font-semibold rounded flex items-center justify-center transition-all cursor-pointer border select-none ${stateClass} ${ringClass}`}
              onClick={() => onGoTo(idx)}
              aria-label={`Question ${idx + 1}${stateLabel}`}
              aria-current={isCurrent ? "true" : undefined}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap pt-1">
        <span className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 inline-block"
            aria-hidden="true"
          />
          Unanswered
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded bg-indigo-100 border border-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-700 inline-block"
            aria-hidden="true"
          />
          Answered
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded bg-amber-100 border border-amber-300 dark:bg-amber-900/30 dark:border-amber-700 inline-block"
            aria-hidden="true"
          />
          Flagged
        </span>
      </div>
    </div>
  );
}
