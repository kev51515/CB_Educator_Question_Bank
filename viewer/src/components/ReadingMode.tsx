import { useEffect, useRef, useState } from "react";
import type { Question } from "@/types";
import { IDENTITY } from "@/lib/designTokens";
import { useFocusTrap } from "@/hooks";

// ─────────────────────────────── types ───────────────────────────────

interface ReadingModeProps {
  open: boolean;
  onClose: () => void;
  question: Question | null;
  number: number | null;
}

interface ReadingModeToggleProps {
  onClick: () => void;
}

const LETTERS = ["A", "B", "C", "D", "E"];

// ───────────────────────────── ReadingMode ───────────────────────────

export function ReadingMode(props: ReadingModeProps): JSX.Element | null {
  const { open, onClose, question, number } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [showAnswer, setShowAnswer] = useState<boolean>(false);

  useFocusTrap(dialogRef, open);

  // Reset answer reveal when the question changes or modal reopens.
  useEffect(() => {
    setShowAnswer(false);
  }, [question?.questionId, open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !question) return null;

  const options = question.answerOptions ?? [];
  const correctIds = new Set(question.keys ?? []);
  const isMcq = options.length > 0;
  const titleId = "reading-mode-title";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={"fixed inset-0 z-30 bg-white overflow-y-auto print:static print:overflow-visible border-t-[3px] " + IDENTITY.accent.topBorder}
    >
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-ink-100 print:hidden">
        <div className="max-w-3xl mx-auto px-6 sm:px-8 py-3 flex items-center justify-between">
          <h2 id={titleId} className="text-[15px] font-semibold text-ink-700">
            Reading mode
            {number != null && (
              <>
                <span className="text-ink-400 mx-1.5">·</span>
                <span className="text-ink-600">#{number}</span>
              </>
            )}
          </h2>
          <button
            type="button"
            data-close
            data-autofocus
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close reading mode"
            className="w-8 h-8 rounded-md inline-flex items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100 focus-ring transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Body */}
      <article
        className="max-w-3xl mx-auto px-6 sm:px-10 py-10 print:px-0 print:py-4 print:max-w-none"
        style={{ fontSize: "18px", lineHeight: 1.8 }}
      >
        {/* Print-only header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-semibold">
            Question {number ?? ""}
          </h1>
        </div>

        {question.stimulus && (
          <section className="mb-8">
            <div
              className="q-html text-ink-800"
              dangerouslySetInnerHTML={{ __html: question.stimulus }}
            />
          </section>
        )}

        {question.stem && (
          <section className="mb-8">
            <div
              className="q-html text-ink-900 font-medium"
              dangerouslySetInnerHTML={{ __html: question.stem }}
            />
          </section>
        )}

        {isMcq && (
          <section className="mb-10 space-y-3">
            {options.map((opt, i) => {
              const isCorrect = correctIds.has(opt.id);
              const highlight = showAnswer && isCorrect;
              return (
                <div
                  key={opt.id}
                  className={
                    "flex gap-5 px-6 py-4 rounded-xl border transition-colors " +
                    (highlight
                      ? "border-accent-400 bg-accent-50"
                      : "border-ink-200 bg-white")
                  }
                >
                  <div
                    className={
                      "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-semibold " +
                      (highlight
                        ? "bg-accent-600 text-white"
                        : "bg-ink-100 text-ink-700")
                    }
                  >
                    {LETTERS[i] ?? "?"}
                  </div>
                  <div
                    className="flex-1 q-html"
                    dangerouslySetInnerHTML={{ __html: opt.content }}
                  />
                  {highlight && (
                    <span className="shrink-0 text-[12px] font-semibold text-accent-700 flex items-center gap-1">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Correct
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {!isMcq && showAnswer && question.keys && question.keys.length > 0 && (
          <section className="mb-10 px-6 py-5 rounded-xl border border-accent-300 bg-accent-50">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-accent-700 mb-2">
              Answer
            </div>
            <div className="text-[20px] font-mono text-accent-800">
              {question.keys.join(", ")}
            </div>
          </section>
        )}

        {showAnswer && question.rationale && (
          <section className="mb-10">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-500 mb-2">
              Rationale
            </div>
            <div
              className="q-html text-ink-800"
              dangerouslySetInnerHTML={{ __html: question.rationale }}
            />
          </section>
        )}

        <div className="mt-8 print:hidden">
          {!showAnswer ? (
            <button
              type="button"
              onClick={() => setShowAnswer(true)}
              className="px-5 py-2.5 rounded-lg bg-accent-600 text-white text-[14px] font-medium hover:bg-accent-700 focus-ring transition-colors"
            >
              Show answer
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAnswer(false)}
              className="px-5 py-2.5 rounded-lg bg-ink-100 text-ink-700 text-[14px] font-medium hover:bg-ink-200 focus-ring transition-colors"
            >
              Hide answer
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

// ────────────────────────── ReadingModeToggle ────────────────────────

export function ReadingModeToggle(
  props: ReadingModeToggleProps,
): JSX.Element {
  const { onClick } = props;
  const title = "Reading mode";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      data-tooltip={title}
      className="w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors focus-ring text-ink-500 hover:text-ink-800 hover:bg-ink-100"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {/* Open book icon */}
        <path d="M2 4h7a3 3 0 0 1 3 3v13" />
        <path d="M22 4h-7a3 3 0 0 0-3 3v13" />
        <path d="M2 4v15h7a3 3 0 0 1 3 3" />
        <path d="M22 4v15h-7a3 3 0 0 0-3 3" />
      </svg>
    </button>
  );
}
