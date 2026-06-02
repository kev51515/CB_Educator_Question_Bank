/**
 * TestPhase — main test-taking UI.
 *
 * Owns:
 *   - Countdown timer (via `useTestTimer`).
 *   - Submit-confirmation modal state.
 *   - Keyboard shortcuts (1-4 / A-D / arrows / F).
 *
 * State that needs to persist between questions (answers, flags) lives in the
 * parent `MockTestApp` so the localStorage snapshot stays accurate.
 */
import { useCallback, useEffect, useState } from "react";
import type { Letter, TestQuestion } from "../types";
import { AnswerChoices } from "./AnswerChoices";
import { QuestionPassage } from "./QuestionPassage";
import { RichText } from "./RichText";
import { SubmitConfirmDialog } from "./SubmitConfirmDialog";
import { TestPhaseFooter } from "./TestPhaseFooter";
import { TestPhaseHeader } from "./TestPhaseHeader";
import { TestQuestionNav } from "./TestQuestionNav";
import { useTestTimer } from "./useTestTimer";

interface TestPhaseProps {
  sessionId: string;
  label: string;
  questions: TestQuestion[];
  currentIdx: number;
  answers: Record<string, Letter | null>;
  flagged: ReadonlySet<string>;
  totalSeconds: number;
  onAnswer: (questionId: string, letter: Letter) => void;
  onGoTo: (idx: number) => void;
  onToggleFlag: (questionId: string) => void;
  onSubmit: () => void;
}

function isFormTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function TestPhase({
  sessionId,
  label,
  questions,
  currentIdx,
  answers,
  flagged,
  totalSeconds,
  onAnswer,
  onGoTo,
  onToggleFlag,
  onSubmit,
}: TestPhaseProps) {
  const total = questions.length;
  const currentQuestion = questions[currentIdx] ?? null;

  const handleTimeUp = useCallback(() => {
    onSubmit();
  }, [onSubmit]);

  const { timeLeft, timerWarning, timerCritical } = useTestTimer({
    totalSeconds,
    sessionKey: sessionId,
    onTimeUp: handleTimeUp,
  });

  const [showConfirm, setShowConfirm] = useState(false);
  const handleSubmitClick = useCallback(() => setShowConfirm(true), []);
  const handleConfirmSubmit = useCallback(() => {
    setShowConfirm(false);
    onSubmit();
  }, [onSubmit]);
  const handleCancelSubmit = useCallback(() => setShowConfirm(false), []);

  const answeredCount = Object.values(answers).filter((v) => v != null).length;
  const unansweredCount = total - answeredCount;
  const flaggedCount = flagged.size;

  const selectedLetter = currentQuestion ? answers[currentQuestion.id] ?? null : null;
  const isFlagged = currentQuestion ? flagged.has(currentQuestion.id) : false;
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === total - 1;

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (isFormTarget(e.target)) return;
      if (showConfirm) {
        if (e.key === "Escape") handleCancelSubmit();
        return;
      }
      // Arrow keys inside the radiogroup are owned by AnswerChoices (roving
      // tabindex). Skip the global handler when focus is on an answer choice
      // so we don't double-handle (which would also jump to next question).
      if (
        e.target instanceof HTMLElement &&
        e.target.getAttribute("role") === "radio"
      ) {
        // Let the choice-level handler manage Arrow/Space; we still allow
        // 1-4 / A-D / F / Enter to flow through below.
        if (
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === " "
        ) {
          return;
        }
      }
      const upper = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (!currentQuestion) return;
      // M15: Enter advances to the next question (or opens Submit confirm
      // on the last one). Sophia (power user) expects this. Don't trigger
      // when Shift is held (allows future shift-enter behaviors).
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isLast) {
          handleSubmitClick();
        } else {
          onGoTo(currentIdx + 1);
        }
        return;
      }
      switch (upper) {
        case "1":
        case "A":
          onAnswer(currentQuestion.id, "A");
          break;
        case "2":
        case "B":
          onAnswer(currentQuestion.id, "B");
          break;
        case "3":
        case "C":
          onAnswer(currentQuestion.id, "C");
          break;
        case "4":
        case "D":
          onAnswer(currentQuestion.id, "D");
          break;
        case "ArrowRight":
        case "ArrowDown":
          if (!isLast) onGoTo(currentIdx + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          if (!isFirst) onGoTo(currentIdx - 1);
          break;
        case "F":
          onToggleFlag(currentQuestion.id);
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    showConfirm,
    isFirst,
    isLast,
    currentIdx,
    currentQuestion,
    onAnswer,
    onGoTo,
    onToggleFlag,
    handleCancelSubmit,
    handleSubmitClick,
  ]);

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <p className="text-slate-500">No question to display.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen min-h-0 bg-white dark:bg-slate-950">
      <TestPhaseHeader
        label={label}
        timeLeftSeconds={timeLeft}
        timerWarning={timerWarning}
        timerCritical={timerCritical}
        currentIdx={currentIdx}
        total={total}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 p-4 gap-4 overflow-y-auto">
          <TestQuestionNav
            questions={questions}
            currentIdx={currentIdx}
            answers={answers}
            flagged={flagged}
            onGoTo={onGoTo}
          />
          <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleSubmitClick}
              className="w-full text-xs h-8 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              ✓ Submit Test
            </button>
          </div>
        </aside>
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 pb-24 lg:pb-8">
            <QuestionPassage question={currentQuestion} />
            <div className="mb-5">
              <RichText
                text={currentQuestion.stem}
                isHtml={currentQuestion.isHtml}
                className="text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100"
              />
            </div>
            <AnswerChoices
              question={currentQuestion}
              selectedLetter={selectedLetter}
              onAnswer={(letter) => onAnswer(currentQuestion.id, letter)}
            />
            {/*
              M23: on mobile/tablet (<lg) the sidebar is hidden, so the
              palette would otherwise be unreachable for Sophia. Inline a
              tap-friendly version below the choices. Cells are 40×40 to
              meet the ≥40px tap-target rule. Uses the same color codes as
              the desktop TestQuestionNav so the legend transfers visually.
            */}
            <div
              className="mt-8 lg:hidden border-t border-slate-200 dark:border-slate-800 pt-4"
              aria-label="Mobile question palette"
            >
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Questions
              </p>
              <div
                className="flex flex-wrap gap-1.5"
                role="list"
                aria-label="Jump to question"
              >
                {questions.map((q, idx) => {
                  const isAnswered = answers[q.id] != null;
                  const isFlaggedQ = flagged.has(q.id);
                  const isCurrent = idx === currentIdx;
                  const stateClass = isFlaggedQ
                    ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
                    : isAnswered
                      ? "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700"
                      : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
                  const ringClass = isCurrent
                    ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-950"
                    : "";
                  const stateLabel = isFlaggedQ
                    ? " (flagged)"
                    : isAnswered
                      ? " (answered)"
                      : " (unanswered)";
                  return (
                    <button
                      key={q.id}
                      type="button"
                      role="listitem"
                      onClick={() => onGoTo(idx)}
                      aria-label={`Question ${idx + 1}${stateLabel}`}
                      aria-current={isCurrent ? "true" : undefined}
                      className={[
                        "w-10 h-10 text-xs font-semibold rounded flex items-center justify-center border select-none transition-colors",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950",
                        stateClass,
                        ringClass,
                      ].join(" ")}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>
      <TestPhaseFooter
        currentQuestion={currentQuestion}
        isFlagged={isFlagged}
        isFirst={isFirst}
        isLast={isLast}
        onToggleFlag={onToggleFlag}
        onGoTo={onGoTo}
        currentIdx={currentIdx}
        onSubmitClick={handleSubmitClick}
      />
      {showConfirm && (
        <SubmitConfirmDialog
          answeredCount={answeredCount}
          unansweredCount={unansweredCount}
          flaggedCount={flaggedCount}
          total={total}
          onConfirm={handleConfirmSubmit}
          onCancel={handleCancelSubmit}
        />
      )}
    </div>
  );
}
