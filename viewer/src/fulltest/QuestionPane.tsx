/**
 * QuestionPane
 * ============
 * Renders ONE full-test question, Bluebook-style: for Reading & Writing, a
 * two-column split (stimulus left / question + choices right). For Math, a
 * single column with an optional figure above the stem.
 *
 * Supports both answer modes:
 *   • mcq  — four selectable choice rows (A–D)
 *   • grid — a free-text "student-produced response" input (numbers/fractions)
 *
 * Figures (graphs / tables / dot plots) are served PNGs; for R&W quantitative
 * items the figure IS the stimulus (passage is null, image authoritative).
 */
import type { Letter, TestQuestion } from "./types";

const LETTERS: Letter[] = ["A", "B", "C", "D"];

interface QuestionPaneProps {
  question: TestQuestion;
  value: string | null;
  onChange: (value: string | null) => void;
  /** read-only review mode disables inputs */
  disabled?: boolean;
}

export function QuestionPane({ question, value, onChange, disabled }: QuestionPaneProps) {
  const isRW = question.section === "reading-writing";
  const hasStimulus = Boolean(question.passage || question.figure);

  const stimulus = (
    <div className="space-y-4">
      {question.figure && (
        <img
          src={question.figure}
          alt={question.passage_alt ?? "Figure for this question"}
          className="max-w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
        />
      )}
      {question.passage && (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
          {question.passage}
        </p>
      )}
    </div>
  );

  const prompt = (
    <div className="space-y-4">
      <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-slate-900 dark:text-slate-100">
        {question.stem}
      </p>

      {question.type === "mcq" && question.choices && (
        <ul className="space-y-2">
          {LETTERS.map((letter) => {
            const text = question.choices![letter];
            if (text === undefined) return null;
            const selected = value === letter;
            return (
              <li key={letter}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(selected ? null : letter)}
                  className={[
                    "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
                    selected
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/40 dark:border-indigo-400 dark:bg-indigo-950/40"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800",
                    disabled ? "cursor-default opacity-90" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                      selected
                        ? "border-indigo-500 bg-indigo-500 text-white"
                        : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300",
                    ].join(" ")}
                  >
                    {letter}
                  </span>
                  <span className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
                    {text}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {question.type === "grid" && (
        <div className="space-y-2">
          <label
            htmlFor={`grid-${question.id}`}
            className="block text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            Your answer
          </label>
          <input
            id={`grid-${question.id}`}
            type="text"
            inputMode="text"
            autoComplete="off"
            disabled={disabled}
            value={value ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v.trim() === "" ? null : v);
            }}
            placeholder="e.g. 7, 3/5, or 4.75"
            className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-90 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Student-produced response. Enter a number; fractions (3/5) and
            decimals (4.75) are accepted. Negative values are allowed.
          </p>
        </div>
      )}
    </div>
  );

  if (isRW && hasStimulus) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:border-r md:border-slate-200 md:pr-6 dark:md:border-slate-700">
          {stimulus}
        </div>
        <div>{prompt}</div>
      </div>
    );
  }

  // Math (figure above stem) or stimulus-less question: single column.
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {question.figure && stimulus}
      {!question.figure && question.passage && stimulus}
      {prompt}
    </div>
  );
}
