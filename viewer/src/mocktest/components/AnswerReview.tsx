/**
 * AnswerReview — expandable list of every question with correct/wrong status.
 *
 * Filter tabs: All / Wrong / Skipped. Rows show the user's pick vs the correct
 * letter and, when available, the rationale supplied by the question source.
 */
import { useState } from "react";
import type { Letter, TestQuestion } from "../types";
import { RichText } from "./RichText";
import { truncate } from "./resultsHelpers";

type FilterId = "all" | "wrong" | "skipped";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "wrong", label: "Wrong" },
  { id: "skipped", label: "Skipped" },
];

interface ReviewRow {
  question: TestQuestion;
  selectedLetter: Letter | null;
  correct: boolean;
  skipped: boolean;
}

interface AnswerReviewProps {
  questions: TestQuestion[];
  answers: Record<string, Letter | null>;
  open: boolean;
  onToggle: () => void;
}

export function AnswerReview({ questions, answers, open, onToggle }: AnswerReviewProps) {
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");

  if (questions.length === 0) return null;

  const rows: ReviewRow[] = questions.map((q) => {
    const selectedLetter = answers[q.id] ?? null;
    return {
      question: q,
      selectedLetter,
      correct: selectedLetter != null && selectedLetter === q.correctAnswer,
      skipped: selectedLetter == null,
    };
  });

  const counts: Record<FilterId, number> = {
    all: rows.length,
    wrong: rows.filter((r) => !r.correct && !r.skipped).length,
    skipped: rows.filter((r) => r.skipped).length,
  };

  const visible =
    activeFilter === "wrong"
      ? rows.filter((r) => !r.correct && !r.skipped)
      : activeFilter === "skipped"
        ? rows.filter((r) => r.skipped)
        : rows;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-expanded={open}
      >
        <span>Answer Review ({rows.length} questions)</span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <>
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={[
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  activeFilter === f.id
                    ? "bg-indigo-600 text-white"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800",
                ].join(" ")}
                aria-pressed={activeFilter === f.id}
              >
                {f.label}
                {counts[f.id] > 0 && (
                  <span className={`ml-1.5 ${activeFilter === f.id ? "opacity-80" : "opacity-60"}`}>
                    ({counts[f.id]})
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950">
            {visible.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">
                No {activeFilter === "wrong" ? "wrong" : activeFilter === "skipped" ? "skipped" : ""}{" "}
                answers.
              </p>
            ) : (
              visible.map((row, i) => <Row key={`${row.question.id}-${i}`} row={row} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface RowProps {
  row: ReviewRow;
}

function Row({ row }: RowProps) {
  const { question, selectedLetter, correct, skipped } = row;
  // CB questions ship as HTML, so we strip tags for the row preview.
  const plainStem = question.isHtml ? stripHtml(question.stem) : question.stem;
  const stemPreview = truncate(plainStem, 80);

  let rowColor = "bg-white dark:bg-slate-950";
  let icon = "○";
  let iconColor = "text-slate-400";
  if (!skipped && correct) {
    rowColor = "bg-emerald-50/60 dark:bg-emerald-950/30";
    icon = "✓";
    iconColor = "text-emerald-500";
  } else if (!skipped && !correct) {
    rowColor = "bg-red-50/60 dark:bg-red-950/30";
    icon = "✕";
    iconColor = "text-red-500";
  }

  const correctRationale =
    question.correctRationale ??
    (selectedLetter && question.wrongRationales ? question.wrongRationales[selectedLetter] : undefined);

  return (
    <div className={`group flex items-start gap-3 px-4 py-3 text-sm ${rowColor}`}>
      <span className={`w-4 shrink-0 mt-0.5 text-base ${iconColor}`} aria-hidden="true">
        {icon}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-slate-900 dark:text-slate-100 leading-snug">{stemPreview}</p>
        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
          <span>
            Your answer:{" "}
            <span
              className={
                skipped
                  ? "text-slate-400"
                  : correct
                    ? "text-emerald-500 font-semibold"
                    : "text-red-500 font-semibold"
              }
            >
              {selectedLetter ?? "—"}
            </span>
          </span>
          {!correct && !skipped && (
            <span>
              Correct:{" "}
              <span className="text-emerald-500 font-semibold">{question.correctAnswer}</span>
            </span>
          )}
          {skipped && <span className="text-slate-400 italic">Skipped</span>}
        </div>
        {correctRationale && (
          <RichText
            text={correctRationale}
            isHtml={question.isHtml}
            className="text-xs text-slate-500 mt-1"
          />
        )}
      </div>
    </div>
  );
}

function stripHtml(html: string): string {
  // Lightweight tag/MathML strip for previews; not for trusted contexts.
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
