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
import type { ResultQuestion, TestResult } from "./types";

const SECTION_LABEL: Record<string, string> = {
  "reading-writing": "Reading & Writing",
  math: "Math",
};

export function ResultView({ result, testTitle }: { result: TestResult; testTitle: string }) {
  const navigate = useNavigate();
  const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-7 text-white shadow-lg">
          <p className="text-sm uppercase tracking-wide text-white/80">Results</p>
          <h1 className="mt-1 text-2xl font-bold">{testTitle}</h1>
          <div className="mt-4 flex flex-wrap items-end gap-6">
            <div>
              <div className="text-4xl font-bold tabular-nums">
                {result.score}
                <span className="text-2xl font-medium text-white/70">/{result.total}</span>
              </div>
              <div className="text-sm text-white/80">{pct}% correct</div>
            </div>
            {result.section_scores &&
              Object.entries(result.section_scores).map(([section, s]) => (
                <div key={section}>
                  <div className="text-xl font-semibold tabular-nums">
                    {s.correct}/{s.total}
                  </div>
                  <div className="text-sm text-white/80">{SECTION_LABEL[section] ?? section}</div>
                </div>
              ))}
            {typeof result.duration_seconds === "number" && (
              <div>
                <div className="text-xl font-semibold tabular-nums">
                  {Math.floor(result.duration_seconds / 60)} min
                </div>
                <div className="text-sm text-white/80">Time taken</div>
              </div>
            )}
          </div>
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
