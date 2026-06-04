import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Question, IndexEntry } from "@/types";
import { IDENTITY } from "@/lib/designTokens";
import { useFocusTrap } from "@/hooks";

// ─────────────────────────── types ───────────────────────────────

interface CompareViewProps {
  open: boolean;
  onClose: () => void;
  leftQuestion: Question | null;
  rightQuestion: Question | null;
  leftNumber: number | null;
  rightNumber: number | null;
  index: IndexEntry[];
  onPickQuestion: (side: "left" | "right", id: string) => void;
}

// ─────────────────────────── helpers ─────────────────────────────

const LETTERS = ["A", "B", "C", "D", "E"];

function difficultyText(d: string): string {
  switch (d) {
    case "Easy":
      return "text-emerald-700";
    case "Medium":
      return "text-amber-700";
    case "Hard":
      return "text-rose-700";
    default:
      return "text-ink-600";
  }
}

function metaDiffers(
  left: Question | null,
  right: Question | null,
  field: keyof Pick<Question, "difficulty" | "domain" | "skill" | "section">,
): boolean {
  if (!left || !right) return false;
  return left[field] !== right[field];
}

// ─────────────────────── QuestionPicker ──────────────────────────

interface QuestionPickerProps {
  index: IndexEntry[];
  currentId: string | null;
  onPick: (id: string) => void;
  side: "left" | "right";
}

function QuestionPicker({ index, currentId, onPick, side }: QuestionPickerProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index.slice(0, 8);
    const num = q.replace(/^#/, "");
    return index
      .filter((e) => {
        if (/^\d+$/.test(num) && e.number != null) {
          if (String(e.number) === num || String(e.number).startsWith(num))
            return true;
        }
        return (
          e.id.toLowerCase().includes(q) ||
          e.skill.toLowerCase().includes(q) ||
          e.domain.toLowerCase().includes(q) ||
          (e.preview ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [index, query]);

  const current = index.find((e) => e.id === currentId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handlePick = useCallback(
    (id: string) => {
      onPick(id);
      setQuery("");
      setIsOpen(false);
    },
    [onPick],
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <label
          className="text-[11px] font-medium text-ink-500 uppercase tracking-wide shrink-0"
          htmlFor={`compare-picker-${side}`}
        >
          {side === "left" ? "Left" : "Right"}
        </label>
        <input
          id={`compare-picker-${side}`}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={
            current
              ? `#${current.number ?? "?"} ${current.skill}`
              : "Search by # or skill…"
          }
          className="w-48 px-2.5 py-1.5 text-[12px] rounded-md border border-ink-200 bg-white text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 transition"
        />
        {current && (
          <span className="text-[11px] text-ink-600 truncate max-w-[120px]">
            #{current.number ?? "?"} · {current.skill}
          </span>
        )}
      </div>
      {isOpen && filtered.length > 0 && (
        <ul className="absolute top-full left-0 mt-1 w-72 max-h-56 overflow-y-auto bg-white border border-ink-200 rounded-lg shadow-lg z-40 py-1">
          {filtered.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => handlePick(e.id)}
                className={
                  "w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent-50 transition-colors flex items-center gap-2 " +
                  (e.id === currentId ? "bg-accent-50 font-medium" : "")
                }
              >
                <span className="tabular-nums text-ink-500 shrink-0 w-8">
                  #{e.number ?? "?"}
                </span>
                <span className="truncate text-ink-800">{e.skill}</span>
                <span className="ml-auto text-ink-400 text-[11px] shrink-0">
                  {e.section}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ──────────────────────── QuestionPane ────────────────────────────

interface QuestionPaneProps {
  question: Question | null;
  number: number | null;
  otherQuestion: Question | null;
}

function QuestionPane({
  question,
  number,
  otherQuestion,
}: QuestionPaneProps) {
  if (!question) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-center p-10 text-[13px] text-ink-400">
        Pick a question above.
      </div>
    );
  }

  const correctIds = new Set(question.keys ?? []);
  const isMcq =
    question.type === "mcq" &&
    Array.isArray(question.answerOptions) &&
    question.answerOptions.length > 0;

  return (
    <div className="flex-1 min-w-0 overflow-y-auto thin-scrollbar px-6 py-6 md:px-8">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2 mb-1.5">
          <h3 className="text-[20px] font-semibold tracking-tight text-ink-800 tabular-nums">
            {number != null ? (
              <>
                <span className="text-ink-300 font-medium mr-0.5">#</span>
                {number}
              </>
            ) : (
              "Question"
            )}
          </h3>
          {question.type === "spr" && (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500 px-1.5 py-0.5 rounded bg-ink-100">
              SPR
            </span>
          )}
        </div>
        {/* Metadata breadcrumb with diff highlighting */}
        <div className="text-[12px] text-ink-500 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={
              metaDiffers(question, otherQuestion, "section")
                ? "bg-amber-50 px-1 rounded"
                : ""
            }
          >
            {question.section}
          </span>
          <span className="text-ink-300">·</span>
          <span
            className={
              (metaDiffers(question, otherQuestion, "difficulty")
                ? "bg-amber-50 px-1 rounded "
                : "") + difficultyText(question.difficulty)
            }
          >
            {question.difficulty}
          </span>
          <span className="text-ink-300">·</span>
          <span
            className={
              metaDiffers(question, otherQuestion, "domain")
                ? "bg-amber-50 px-1 rounded"
                : ""
            }
          >
            {question.domain}
          </span>
          {question.skill && (
            <>
              <span className="text-ink-300">·</span>
              <span
                className={
                  "font-medium text-ink-700 " +
                  (metaDiffers(question, otherQuestion, "skill")
                    ? "bg-amber-50 px-1 rounded"
                    : "")
                }
              >
                {question.skill}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stimulus */}
      {question.stimulus && (
        <section className="mb-6 pl-4 border-l-[3px] border-ink-200 text-ink-800 leading-relaxed text-[14px]">
          <div
            className="q-html"
            dangerouslySetInnerHTML={{ __html: question.stimulus }}
          />
        </section>
      )}

      {/* Stem */}
      <section className="mb-6 font-medium leading-relaxed text-ink-800 text-[15px]">
        {question.stem.trim() ? (
          <div
            className="q-html"
            dangerouslySetInnerHTML={{ __html: question.stem }}
          />
        ) : (
          <p className="italic text-ink-400">(No prompt text in source.)</p>
        )}
      </section>

      {/* MCQ choices */}
      {isMcq && (
        <section className="mb-6 space-y-1.5">
          {(question.answerOptions ?? []).map((opt, i) => {
            const isCorrect = correctIds.has(opt.id);
            return (
              <div
                key={opt.id}
                className={
                  "flex gap-3 px-4 py-2.5 rounded-lg border transition-all " +
                  (isCorrect
                    ? "border-accent-400 bg-accent-50"
                    : "border-ink-200 bg-white")
                }
              >
                <div
                  className={
                    "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium " +
                    (isCorrect
                      ? "bg-accent-600 text-white"
                      : "bg-ink-100 text-ink-700")
                  }
                >
                  {LETTERS[i] ?? "?"}
                </div>
                <div
                  className="flex-1 leading-relaxed text-[14px] q-html"
                  dangerouslySetInnerHTML={{ __html: opt.content }}
                />
                {isCorrect && (
                  <span className="shrink-0 text-[10px] font-semibold text-accent-600 flex items-center gap-0.5">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-3 h-3"
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

      {/* SPR */}
      {question.type === "spr" && (
        <section className="mb-6">
          <div className="px-4 py-4 rounded-lg border border-ink-200 bg-ink-50">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-1.5">
              Student-produced response
            </div>
            {question.keys?.[0] ? (
              <div className="text-xl font-mono text-accent-700">
                {question.keys[0]}
              </div>
            ) : (
              <div className="text-[13px] text-ink-500">
                Answer not available.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ───────────────────────── CompareView ────────────────────────────

export function CompareView({
  open,
  onClose,
  leftQuestion,
  rightQuestion,
  leftNumber,
  rightNumber,
  index,
  onPickQuestion,
}: CompareViewProps): JSX.Element | null {
  // Close on Escape — hook must be declared before early return
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Compare Questions"
      className={"fixed inset-0 z-30 bg-white flex flex-col border-t-[3px] " + IDENTITY.format.topBorder}
      onKeyDown={onKeyDown}
    >
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between gap-4 px-6 h-12 border-b border-ink-150 bg-white">
        <h2 className="text-[14px] font-semibold tracking-tight text-ink-800">
          Compare Questions
        </h2>
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0 justify-center">
          <QuestionPicker
            index={index}
            currentId={leftQuestion?.questionId ?? null}
            onPick={(id) => onPickQuestion("left", id)}
            side="left"
          />
          <span className="text-ink-300 text-[13px]">vs</span>
          <QuestionPicker
            index={index}
            currentId={rightQuestion?.questionId ?? null}
            onPick={(id) => onPickQuestion("right", id)}
            side="right"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring shrink-0"
          aria-label="Close comparison"
          title="Close (Esc)"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      {/* Two-column layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        <QuestionPane
          question={leftQuestion}
          number={leftNumber}
          otherQuestion={rightQuestion}
        />
        {/* Vertical divider (desktop) / horizontal (mobile) */}
        <div className="hidden md:block w-px bg-ink-200 shrink-0" aria-hidden />
        <div className="md:hidden h-px bg-ink-200 shrink-0" aria-hidden />
        <QuestionPane
          question={rightQuestion}
          number={rightNumber}
          otherQuestion={leftQuestion}
        />
      </div>
    </div>
  );
}
