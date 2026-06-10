/**
 * TeacherAttemptDetailView — presentational sub-components
 * ========================================================
 * Pure (no own data-fetching) sections of the attempt detail view. JSX moved
 * verbatim from the original single-file component; the orchestrator owns all
 * state + callbacks and passes them in as props.
 */
import { formatAttemptTimestamp, formatDurationSeconds } from "@/lib/attemptReview";
import type { AttemptReviewData } from "@/lib/attemptReview";
import { ScoreHero } from "@/mocktest/components/ScoreHero";
import { SectionBreakdownCards } from "@/mocktest/components/SectionBreakdownCards";
import { ModuleBreakdownTable } from "@/mocktest/components/ModuleBreakdownTable";
import { SkillBreakdownCard } from "@/mocktest/components/SkillBreakdownCard";
import { SkeletonRows } from "@/components/Skeleton";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { FEEDBACK_DEBOUNCE_MS, FEEDBACK_MAX_LEN } from "./grading-hooks";
import type { PerQuestionRow, SkillTally } from "./helpers";

export function LoadingState() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <SkeletonRows count={3} />
      </div>
    </div>
  );
}

export function ErrorState({
  error,
  onBack,
}: {
  error: string | null;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Couldn't load this attempt
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {error ?? "Attempt not found."}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 min-h-[40px]"
        >
          Back
        </button>
      </div>
    </div>
  );
}

export function ResultBreakdown({
  data,
  avgSecondsPerQuestion,
  cbCount,
  satCount,
}: {
  data: AttemptReviewData;
  avgSecondsPerQuestion: number | null;
  cbCount: number;
  satCount: number;
}) {
  if (!(data.result !== null && data.result)) {
    return (
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 text-sm text-slate-600 dark:text-slate-400">
        This attempt hasn't been submitted yet, or no aggregate breakdowns
        are available.
      </div>
    );
  }
  return (
    <>
      <ScoreHero
        scorePercent={data.result.scorePercent}
        correctCount={data.result.correctCount}
        totalQuestions={data.result.totalQuestions}
        scoreOverride={data.scoreOverride}
      />
      {avgSecondsPerQuestion !== null && (
        <div
          className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
          aria-label="Pacing summary"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 ring-1 ring-slate-200 dark:ring-slate-700">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Avg / question
            </span>
            <span className="tabular-nums text-slate-900 dark:text-slate-100">
              {formatDurationSeconds(Math.round(avgSecondsPerQuestion))}
            </span>
          </span>
        </div>
      )}
      <SectionBreakdownCards
        byDomain={data.result.byDomain}
        byDifficulty={data.result.byDifficulty}
      />
      <ModuleBreakdownTable
        durationSeconds={data.result.durationSeconds}
        totalQuestions={data.result.totalQuestions}
        cbCount={cbCount}
        satCount={satCount}
      />
      <SkillBreakdownCard bySkill={data.result.bySkill} />
    </>
  );
}

export function SkillTallySection({
  skillTallies,
}: {
  skillTallies: SkillTally[];
}) {
  return (
    <details className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 group">
      <summary className="cursor-pointer list-none px-5 py-3 min-h-[40px] flex items-center justify-between gap-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Skill breakdown
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 group-open:hidden">
          Show details
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 hidden group-open:inline">
          Hide details
        </span>
      </summary>
      <ul className="px-5 pb-4 space-y-2">
        {skillTallies.map((s) => {
          const rate = s.total === 0 ? 0 : s.correct / s.total;
          const ratePct = Math.round(rate * 100);
          return (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-slate-700 dark:text-slate-200 truncate">
                {s.label}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="tabular-nums text-slate-900 dark:text-slate-100 font-medium">
                  {s.correct}/{s.total} correct
                </span>
                <span
                  className={
                    ratePct >= 80
                      ? "rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : ratePct >= 50
                        ? "rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                  }
                >
                  {ratePct}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function PerQuestionSection({
  perQuestionRows,
}: {
  perQuestionRows: PerQuestionRow[];
}) {
  return (
    <details className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 group">
      <summary className="cursor-pointer list-none px-5 py-3 min-h-[40px] flex items-center justify-between gap-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Per-question detail
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 group-open:hidden">
          Show details
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 hidden group-open:inline">
          Hide details
        </span>
      </summary>
      <div className="px-5 pb-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Per-question timing isn&apos;t tracked for assignment attempts
          yet — only the aggregate duration above is recorded. Status is
          derived from the snapshot saved at submission time.
        </p>
        <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
              <tr>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  #
                </th>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Chosen
                </th>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Correct
                </th>
                <th scope="col" className="text-left px-4 py-2 font-medium">
                  Skill
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {perQuestionRows.map((r) => (
                <tr
                  key={r.questionId}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                >
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400 font-mono text-xs tabular-nums">
                    {r.position}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        r.status === "correct"
                          ? "inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : r.status === "wrong"
                            ? "inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                            : "inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }
                    >
                      {r.status === "correct"
                        ? "Correct"
                        : r.status === "wrong"
                          ? "Wrong"
                          : "Skipped"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-900 dark:text-slate-100 font-medium">
                    {r.chosen ?? (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                    {r.correctAnswer}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400 truncate max-w-[14rem]">
                    {r.skill ?? r.domain ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export function GradingPanel({
  savingFeedback,
  isGraded,
  gradedAt,
  feedbackHtml,
  onChangeFeedback,
  flushFeedback,
  scoreOverride,
  setScoreOverride,
  onBlurScoreOverride,
  autoScore,
  onToggleGraded,
  onSaveAndNext,
  canSaveAndNext,
}: {
  savingFeedback: boolean;
  isGraded: boolean;
  gradedAt: string | null;
  feedbackHtml: string;
  onChangeFeedback: (html: string) => void;
  flushFeedback: (silent?: boolean) => Promise<void>;
  scoreOverride: string;
  setScoreOverride: (value: string) => void;
  onBlurScoreOverride: () => void;
  autoScore: number | null;
  onToggleGraded: () => void;
  onSaveAndNext: () => void;
  canSaveAndNext: boolean;
}) {
  return (
    <section
      aria-labelledby="grading-title"
      className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-4"
    >
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h2
          id="grading-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          Grading
        </h2>
        <div className="flex items-center gap-2">
          {savingFeedback && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Saving…
            </span>
          )}
          {isGraded && !savingFeedback && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              Marked graded {formatAttemptTimestamp(gradedAt)}
            </span>
          )}
        </div>
      </header>

      <div className="space-y-2">
        <label
          htmlFor="grading-feedback"
          className="block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Feedback for student
        </label>
        <div id="grading-feedback" onBlur={() => void flushFeedback(true)}>
          <MarkdownEditor
            value={feedbackHtml}
            onChange={onChangeFeedback}
            placeholder="What did this student do well? What should they work on?"
            minHeight={140}
            characterLimit={FEEDBACK_MAX_LEN}
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Autosaves to the server on blur and{" "}
          {Math.round(FEEDBACK_DEBOUNCE_MS / 1000)}s after you stop typing.
          Cmd/Ctrl+S to flush, Cmd/Ctrl+Enter to save and advance to the
          next student.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label
            htmlFor="grading-score-override"
            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Score override
          </label>
          <div className="flex items-center gap-2">
            <input
              id="grading-score-override"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={scoreOverride}
              onChange={(e) => setScoreOverride(e.target.value)}
              onBlur={onBlurScoreOverride}
              className="rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-700 px-3 py-2 min-h-[40px] text-sm w-24 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-describedby="grading-score-help"
            />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              %
            </span>
          </div>
          <p
            id="grading-score-help"
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            Auto-computed: {autoScore === null ? "—" : `${Math.round(autoScore)}%`}
            . Override here if you want to credit partial work.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <button
            type="button"
            onClick={() => void onToggleGraded()}
            className={
              isGraded
                ? "rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 text-sm font-medium px-4 py-2 min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                : "rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            }
          >
            {isGraded ? "Mark ungraded" : "Mark as graded"}
          </button>
          <button
            type="button"
            onClick={() => void onSaveAndNext()}
            disabled={!canSaveAndNext}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Save & Next (Cmd/Ctrl+Enter)"
          >
            Save & Next →
          </button>
        </div>
      </div>
    </section>
  );
}
