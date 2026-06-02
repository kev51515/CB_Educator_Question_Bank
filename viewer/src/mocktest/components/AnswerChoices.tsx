/**
 * AnswerChoices — four multiple-choice answers rendered as an ARIA radiogroup.
 *
 * Letters always render as `A. B. C. D.` in order; per-source content is
 * supplied via `question.choices[letter]`.
 *
 * Accessibility (B4): a true radiogroup so SR users get position-in-set
 * announcements ("Choice 2 of 4") and arrow-key navigation between options.
 * Roving tabindex: only the active radio is focusable via Tab. Arrow keys
 * (Up/Down/Left/Right) move focus AND selection. The number/letter shortcuts
 * (1-4 / A-D) in TestPhase keep working alongside this.
 */
import { useRef } from "react";
import type { Letter, TestQuestion } from "../types";
import { RichText } from "./RichText";

interface AnswerChoicesProps {
  question: TestQuestion;
  selectedLetter: Letter | null;
  onAnswer: (letter: Letter) => void;
}

const CHOICE_LETTERS: readonly Letter[] = ["A", "B", "C", "D"] as const;

export function AnswerChoices({ question, selectedLetter, onAnswer }: AnswerChoicesProps) {
  // Only letters with non-empty content render. Build the active list so
  // roving tabindex + arrow navigation skips empty slots consistently.
  const activeLetters = CHOICE_LETTERS.filter((l) => Boolean(question.choices[l]));

  // The radio that owns the tabstop: the selected one, or the first if none.
  const tabstopLetter: Letter | null = selectedLetter ?? activeLetters[0] ?? null;

  const refs = useRef<Record<Letter, HTMLDivElement | null>>({
    A: null,
    B: null,
    C: null,
    D: null,
  });

  function focusLetter(letter: Letter) {
    refs.current[letter]?.focus();
  }

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>, letter: Letter) {
    const idx = activeLetters.indexOf(letter);
    if (idx === -1) return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight": {
        e.preventDefault();
        e.stopPropagation();
        const next = activeLetters[(idx + 1) % activeLetters.length];
        onAnswer(next);
        focusLetter(next);
        break;
      }
      case "ArrowUp":
      case "ArrowLeft": {
        e.preventDefault();
        e.stopPropagation();
        const prev = activeLetters[(idx - 1 + activeLetters.length) % activeLetters.length];
        onAnswer(prev);
        focusLetter(prev);
        break;
      }
      case " ":
      case "Spacebar":
      case "Enter": {
        // Space selects the focused radio. Enter falls through to the
        // global Enter-advance handler in TestPhase, but selecting first
        // mirrors common radio semantics. Only intercept Space.
        if (e.key !== "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onAnswer(letter);
        }
        break;
      }
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Answer choices"
      className="flex flex-col gap-2.5"
    >
      {activeLetters.map((letter, i) => {
        const text = question.choices[letter];
        if (!text) return null;
        const isSelected = selectedLetter === letter;
        const isTabstop = letter === tabstopLetter;
        return (
          <div
            key={letter}
            ref={(el) => {
              refs.current[letter] = el;
            }}
            role="radio"
            aria-checked={isSelected}
            aria-label={`Choice ${letter}, ${i + 1} of ${activeLetters.length}`}
            tabIndex={isTabstop ? 0 : -1}
            onClick={() => onAnswer(letter)}
            onKeyDown={(e) => handleKey(e, letter)}
            className={[
              "w-full text-left flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors text-sm cursor-pointer",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950",
              isSelected
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-slate-900 dark:text-slate-100"
                : "border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-900/40",
            ].join(" ")}
          >
            <span className="font-semibold shrink-0 w-5 text-sm" aria-hidden="true">
              {letter}.
            </span>
            <RichText
              text={text}
              isHtml={question.isHtml}
              as="inline"
              className="flex-1 leading-snug"
            />
            <span aria-hidden="true" className="text-xs text-slate-400 font-mono ml-auto shrink-0">
              [{i + 1}]
            </span>
          </div>
        );
      })}
    </div>
  );
}
