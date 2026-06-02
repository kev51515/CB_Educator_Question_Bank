/**
 * ResultView
 * ==========
 * Post-submission summary + per-question review for a full test. Only rendered
 * once the run is submitted, when the server safely returns the answer key
 * alongside the student's response (`get_test_result`).
 */
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../lib/routes";
import { QuestionPane } from "./QuestionPane";
import { scaledFromSectionScores } from "./satScore";
import type { ResultQuestion, TestResult } from "./types";

const SECTION_LABEL: Record<string, string> = {
  "reading-writing": "Reading & Writing",
  math: "Math",
};

const SCALED_NOTE =
  "Estimated from your raw section scores on a representative Digital SAT curve. " +
  "The real exam is section-adaptive and uses a per-form table, so treat this as a practice estimate, not an official score.";

export function ResultView({ result, testTitle }: { result: TestResult; testTitle: string }) {
  const navigate = useNavigate();
  const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  const scaled = scaledFromSectionScores(result.section_scores);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-7 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-wide text-white/80">Results</p>
            {scaled.total !== null && (
              <span
                className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90 ring-1 ring-white/20"
                title={SCALED_NOTE}
              >
                Estimated
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold">{testTitle}</h1>

          {scaled.total !== null ? (
            <>
              <div className="mt-5 flex items-end gap-3">
                <div className="text-[3.25rem] font-bold leading-none tabular-nums">
                  {scaled.total}
                </div>
                <div className="pb-1">
                  <div className="text-lg font-medium text-white/70">/ 1600</div>
                  <div className="text-xs uppercase tracking-wide text-white/70">
                    estimated SAT score
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <ScoreChip
                  label="Reading & Writing"
                  scaled={scaled.rw}
                  raw={result.section_scores?.["reading-writing"]}
                />
                <ScoreChip label="Math" scaled={scaled.math} raw={result.section_scores?.["math"]} />
              </div>
            </>
          ) : (
            <div className="mt-4 text-4xl font-bold tabular-nums">
              {result.score}
              <span className="text-2xl font-medium text-white/70">/{result.total}</span>
            </div>
          )}

          {/* Secondary raw + timing stats */}
          <div className="mt-5 flex flex-wrap items-end gap-x-7 gap-y-3 border-t border-white/15 pt-4">
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {result.score}/{result.total}
              </div>
              <div className="text-xs text-white/70">{pct}% correct · raw</div>
            </div>
            {typeof result.duration_seconds === "number" && (
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {Math.floor(result.duration_seconds / 60)} min
                </div>
                <div className="text-xs text-white/70">Time taken</div>
              </div>
            )}
          </div>

          {scaled.total !== null && (
            <p className="mt-3 max-w-xl text-[11px] leading-snug text-white/60">{SCALED_NOTE}</p>
          )}
        </header>

        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Review
          </h2>
          {result.questions.map((rq) => (
            <ReviewCard key={rq.id} rq={rq} />
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => navigate(ROUTES.HOME)}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** A section score chip in the result hero: scaled /800 with raw beneath. */
function ScoreChip({
  label,
  scaled,
  raw,
}: {
  label: string;
  scaled: number | null;
  raw?: { correct: number; total: number };
}) {
  if (scaled === null) return null;
  return (
    <div className="rounded-xl bg-white/10 px-4 py-2.5 ring-1 ring-white/15">
      <div className="text-[11px] font-medium uppercase tracking-wide text-white/70">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums">{scaled}</span>
        <span className="text-xs text-white/60">/ 800</span>
      </div>
      {raw && (
        <div className="text-[11px] text-white/60">
          {raw.correct}/{raw.total} raw
        </div>
      )}
    </div>
  );
}

function ReviewCard({ rq }: { rq: ResultQuestion }) {
  const correct = rq.is_correct === true;
  const blank = !rq.your_answer;
  const yourText =
    rq.type === "mcq" && rq.choices && rq.your_answer
      ? `${rq.your_answer}. ${rq.choices[rq.your_answer as "A"] ?? ""}`
      : rq.your_answer ?? "—";
  const correctText =
    rq.type === "mcq" && rq.choices && rq.correct_answer
      ? `${rq.correct_answer}. ${rq.choices[rq.correct_answer as "A"] ?? ""}`
      : // grid-in stores the canonical answer in `accepted` (correct_answer is null)
        rq.correct_answer ?? rq.accepted?.[0] ?? "—";

  return (
    <div
      className={[
        "rounded-xl border bg-white p-5 dark:bg-slate-900",
        correct
          ? "border-emerald-200 dark:border-emerald-900"
          : "border-rose-200 dark:border-rose-900",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {SECTION_LABEL[rq.section] ?? rq.section} · Q{rq.number}
        </span>
        <span
          className={[
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            correct
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
          ].join(" ")}
        >
          {correct ? "Correct" : blank ? "Skipped" : "Incorrect"}
        </span>
      </div>

      <QuestionPane
        question={{
          id: rq.id,
          ref: rq.ref,
          number: rq.number,
          type: rq.type,
          section: rq.section,
          passage: rq.passage,
          passage_alt: rq.passage_alt,
          stem: rq.stem,
          choices: rq.choices,
          figure: rq.figure,
        }}
        value={rq.your_answer}
        onChange={() => {}}
        disabled
      />

      <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800 sm:grid-cols-2">
        <div>
          <span className="text-slate-500 dark:text-slate-400">Your answer: </span>
          <span className={correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>
            {blank ? "(blank)" : yourText}
          </span>
        </div>
        {!correct && (
          <div>
            <span className="text-slate-500 dark:text-slate-400">Correct answer: </span>
            <span className="text-emerald-700 dark:text-emerald-300">{correctText}</span>
          </div>
        )}
      </div>
    </div>
  );
}
