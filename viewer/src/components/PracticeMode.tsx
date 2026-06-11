import { useEffect, useRef, useState } from "react";
import type { Question } from "@/types";

/* ── Public interfaces ─────────────────────────────────────────────────── */

interface PracticeModeProps {
  question: Question;
  showAnswer: boolean;
  onToggleAnswer: () => void;
  onToggleRationale: () => void;
  showRationale: boolean;
  hasRationale: boolean;
  fontSizeVar: string; // CSS var value like "16px"
  flashcardMode: boolean;
  onRecordAttempt?: (questionId: string, correct: boolean) => void;
}

interface ModeToggleProps {
  mode: "browse" | "practice" | "flashcard";
  onChange: (mode: "browse" | "practice" | "flashcard") => void;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const LETTERS = ["A", "B", "C", "D", "E"];

/* ── HTML helper (same pattern as Detail.tsx) ──────────────────────────── */

function HTML({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    for (const img of ref.current.querySelectorAll("img")) {
      img.loading = "lazy";
      img.decoding = "async";
      if (!img.getAttribute("alt")) img.setAttribute("alt", "");
    }
    for (const a of ref.current.querySelectorAll("a")) {
      if (a.getAttribute("target") !== "_blank") {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    }
  }, [html]);
  return (
    <div
      ref={ref}
      className={"q-html " + (className ?? "")}
      dangerouslySetInnerHTML={{ __html: html || "" }}
    />
  );
}

/* ── PracticeMode ──────────────────────────────────────────────────────── */

export function PracticeMode({
  question,
  showAnswer,
  onToggleAnswer,
  onToggleRationale,
  showRationale,
  hasRationale,
  fontSizeVar,
  flashcardMode,
  onRecordAttempt,
}: PracticeModeProps) {
  const isMcq =
    question.type === "mcq" &&
    Array.isArray(question.answerOptions) &&
    question.answerOptions.length > 0;
  const isSpr = question.type === "spr";

  const correctIds = new Set(question.keys ?? []);
  const sprAnswer = isSpr ? (question.keys?.[0] ?? "") : "";

  // Local interaction state — resets when question changes
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [sprInput, setSprInput] = useState("");
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [choicesRevealed, setChoicesRevealed] = useState(false);

  useEffect(() => {
    setSelectedChoice(null);
    setSprInput("");
    setChecked(false);
    setIsCorrect(false);
    setChoicesRevealed(false);
  }, [question.questionId]);

  const handleCheck = () => {
    if (checked) return;

    let correct: boolean;
    if (isMcq && selectedChoice !== null) {
      correct = correctIds.has(selectedChoice);
    } else if (isSpr && sprInput.trim()) {
      correct = sprInput.trim().toLowerCase() === sprAnswer.trim().toLowerCase();
    } else {
      return;
    }

    setChecked(true);
    setIsCorrect(correct);
    onRecordAttempt?.(question.questionId, correct);

    // Also flip the parent's showAnswer so rationale toggle works
    if (!showAnswer) onToggleAnswer();
  };

  const canCheck =
    (!checked && isMcq && selectedChoice !== null) ||
    (!checked && isSpr && sprInput.trim().length > 0);

  /* ── Stem ────────────────────────────────────────────────────────────── */

  const stem = (question.stem || "").trim();

  return (
    <div>
      {/* Stimulus */}
      {question.stimulus && (
        <section
          className="mb-8 pl-5 border-l-[3px] border-ink-200 text-ink-800 leading-relaxed"
          style={{ fontSize: `calc(${fontSizeVar} - 0.5px)` }}
        >
          <HTML html={question.stimulus} />
        </section>
      )}

      {/* Stem */}
      <section
        className="mb-8 font-medium leading-relaxed text-ink-800"
        style={{ fontSize: fontSizeVar }}
      >
        {stem ? (
          <HTML html={stem} />
        ) : (
          <p className="italic text-ink-400">(No prompt text in source.)</p>
        )}
      </section>

      {/* ── Flashcard gate ─────────────────────────────────────────────── */}
      {flashcardMode && !choicesRevealed && (
        <div className="mb-8 flex flex-col items-center gap-3 py-8">
          <p className="text-[13px] text-ink-500">
            Think about your answer first, then reveal the choices.
          </p>
          <button
            type="button"
            onClick={() => setChoicesRevealed(true)}
            className="px-5 py-2.5 text-[13px] font-medium rounded-lg bg-accent-600 hover:bg-accent-700 text-white shadow-card hover:shadow-md transition-all duration-150 focus-ring"
          >
            Reveal choices
          </button>
        </div>
      )}

      {/* ── MCQ choices ────────────────────────────────────────────────── */}
      {isMcq && (!flashcardMode || choicesRevealed) && (
        <section className="mb-8 space-y-2">
          {(question.answerOptions ?? []).map((opt, i) => {
            const isUserPick = selectedChoice === opt.id;
            const isCorrectChoice = correctIds.has(opt.id);

            // After checking: determine visual state
            let cardCls =
              "border-ink-200 hover:border-accent-400/60 hover:shadow-card bg-white";
            let circleCls =
              "bg-ink-100 text-ink-700 group-hover:bg-ink-200";
            let badge: JSX.Element | null = null;

            if (checked) {
              if (isCorrectChoice) {
                // Green for correct answer
                cardCls = "border-accent-400 bg-accent-50 shadow-card";
                circleCls = "bg-accent-600 text-white";
                badge = (
                  <span className="shrink-0 text-[11px] font-semibold text-accent-600 flex items-center gap-1">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-3.5 h-3.5"
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
                );
              }
              if (isUserPick && !isCorrectChoice) {
                // Rose for wrong pick
                cardCls = "border-rose-300 bg-rose-50 shadow-card";
                circleCls = "bg-rose-500 text-white";
                badge = (
                  <span className="shrink-0 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Incorrect
                  </span>
                );
              }
            } else {
              // Before checking — selection highlight
              if (isUserPick) {
                cardCls =
                  "ring-2 ring-accent-500 bg-accent-50/50 shadow-card";
                circleCls = "bg-accent-600 text-white";
              }
            }

            const clickable = !checked;

            return (
              <button
                key={opt.id}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && setSelectedChoice(opt.id)}
                className={
                  "group flex gap-4 px-5 py-3.5 rounded-xl border transition-all duration-150 w-full text-left " +
                  cardCls +
                  (clickable ? " cursor-pointer focus-ring" : " cursor-default")
                }
              >
                <div
                  className={
                    "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-medium transition-colors " +
                    circleCls
                  }
                >
                  {LETTERS[i] ?? "?"}
                </div>
                <div
                  className="flex-1 leading-relaxed"
                  style={{ fontSize: `calc(${fontSizeVar} - 1px)` }}
                >
                  <HTML html={opt.content} />
                </div>
                {badge}
              </button>
            );
          })}
        </section>
      )}

      {/* ── SPR input ──────────────────────────────────────────────────── */}
      {isSpr && (!flashcardMode || choicesRevealed) && (
        <section className="mb-8">
          <div className="px-5 py-5 rounded-xl border border-ink-200 bg-ink-50">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
              Student-produced response
            </div>
            {!checked ? (
              <input
                type="text"
                value={sprInput}
                onChange={(e) => setSprInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCheck) handleCheck();
                }}
                placeholder="Type your answer..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-ink-200 bg-white text-[16px] font-mono text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 transition"
                autoComplete="off"
              />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-ink-500">Your answer:</span>
                  <span
                    className={
                      "text-lg font-mono " +
                      (isCorrect ? "text-accent-700" : "text-rose-600")
                    }
                  >
                    {sprInput.trim()}
                  </span>
                  {isCorrect ? (
                    <span className="text-[11px] font-semibold text-accent-600 flex items-center gap-1">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3.5 h-3.5"
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
                  ) : (
                    <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      Incorrect
                    </span>
                  )}
                </div>
                {!isCorrect && sprAnswer && (
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-ink-500">
                      Correct answer:
                    </span>
                    <span className="text-lg font-mono text-accent-700">
                      {sprAnswer}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── SPR flashcard gate ─────────────────────────────────────────── */}
      {isSpr && flashcardMode && !choicesRevealed && (
        <div className="mb-8 flex flex-col items-center gap-3 py-8">
          <p className="text-[13px] text-ink-500">
            Think about your answer first, then reveal the input.
          </p>
          <button
            type="button"
            onClick={() => setChoicesRevealed(true)}
            className="px-5 py-2.5 text-[13px] font-medium rounded-lg bg-accent-600 hover:bg-accent-700 text-white shadow-card hover:shadow-md transition-all duration-150 focus-ring"
          >
            Reveal input
          </button>
        </div>
      )}

      {/* ── Action buttons ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5 mb-8">
        {!checked ? (
          <button
            type="button"
            onClick={handleCheck}
            disabled={!canCheck}
            className="px-4 py-2 text-[13px] font-medium rounded-lg bg-accent-600 hover:bg-accent-700 disabled:bg-ink-300 disabled:cursor-not-allowed text-white shadow-card hover:shadow-md transition-all duration-150 focus-ring"
          >
            Check answer
          </button>
        ) : (
          <div
            className={
              "px-4 py-2 text-[13px] font-semibold rounded-lg " +
              (isCorrect
                ? "bg-accent-50 text-accent-700 border border-accent-200"
                : "bg-rose-50 text-rose-700 border border-rose-200")
            }
          >
            {isCorrect ? "Correct!" : "Incorrect"}
          </div>
        )}
        <button
          type="button"
          onClick={onToggleRationale}
          disabled={!hasRationale}
          className="px-4 py-2 text-[13px] font-medium rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-ink-200 transition-colors focus-ring"
        >
          {showRationale
            ? "Hide rationale"
            : hasRationale
              ? "Show rationale"
              : "No rationale"}
        </button>
      </div>

      {/* ── Rationale ──────────────────────────────────────────────────── */}
      {showRationale && hasRationale && question.rationale && (
        <section
          className="mt-2 px-6 py-5 rounded-xl border border-ink-200 bg-ink-50 leading-relaxed"
          style={{ fontSize: `calc(${fontSizeVar} - 1.5px)` }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-3">
            Rationale
          </div>
          <HTML html={question.rationale} />
        </section>
      )}
    </div>
  );
}

/* ── ModeToggle ────────────────────────────────────────────────────────── */

const MODES: { id: "browse" | "practice" | "flashcard"; label: string }[] = [
  { id: "browse", label: "Browse" },
  { id: "practice", label: "Practice" },
  { id: "flashcard", label: "Flashcard" },
];

function activeClass(mode: "browse" | "practice" | "flashcard"): string {
  switch (mode) {
    case "browse":
      return "bg-white text-ink-800 font-medium shadow-sm";
    case "practice":
      return "bg-emerald-50 text-emerald-700 font-medium shadow-sm ring-1 ring-emerald-200";
    case "flashcard":
      return "bg-violet-50 text-violet-700 font-medium shadow-sm ring-1 ring-violet-200";
  }
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-ink-100 p-0.5">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={
            "px-3 py-1 text-[11.5px] font-medium rounded-md transition-all duration-150 " +
            (mode === m.id
              ? activeClass(m.id)
              : "text-ink-500 hover:text-ink-700")
          }
          aria-pressed={mode === m.id}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
