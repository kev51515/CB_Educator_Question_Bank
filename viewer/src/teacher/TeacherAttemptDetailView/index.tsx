/**
 * TeacherAttemptDetailView
 * ========================
 * Teacher-facing detail view of a single student's submitted attempt.
 *
 * Grading state — feedback_text, score_override, graded_at, grader_id — now
 * persists to the database (migration 0053). On mount we ALSO drain any
 * residual localStorage drafts from the Wave 20A MVP buffer into the
 * corresponding DB columns, then clear them. After that:
 *
 *   • Feedback editor (MarkdownEditor) autosaves on blur + 1.5s after typing
 *     pauses. Optimistic local update, server UPDATE in the background, roll
 *     back on error.
 *   • Score override (numeric 0-100) saves on blur.
 *   • "Mark as graded" / "Mark ungraded" toggle UPDATEs graded_at + grader_id.
 *   • J/K (or arrow) navigation between attempts on the same assignment.
 *     Cmd/Ctrl+S force-saves. Cmd/Ctrl+Enter saves + advances.
 *
 * This file is the orchestrator. Stateful logic lives in `grading-hooks.ts`
 * (data load + grading state/persistence + keyboard) and `sibling-nav-hooks.ts`
 * (sibling load + prev/next + navigation). Pure derivations live in
 * `helpers.ts`; presentational sections live in `view-ui.tsx`.
 */
import { useCallback, useMemo, useState } from "react";
import { formatAttemptTimestamp } from "@/lib/attemptReview";
import { AnswerReview } from "@/mocktest/components/AnswerReview";
import { useToast } from "@/components/Toast";
import { useClassContext } from "@/teacher/classLayoutContext";
import type { TeacherAttemptDetailViewProps } from "./types";
import { useAttemptGrading, useAttemptKeyboard } from "./grading-hooks";
import { useSiblingNav } from "./sibling-nav-hooks";
import {
  computePerQuestionRows,
  computeSkillTallies,
  computeHasSkillData,
  computeAvgSecondsPerQuestion,
} from "./helpers";
import {
  LoadingState,
  ErrorState,
  ResultBreakdown,
  SkillTallySection,
  PerQuestionSection,
  GradingPanel,
} from "./view-ui";

export function TeacherAttemptDetailView({
  attemptId,
  onBack,
  onAssignmentTitle,
}: TeacherAttemptDetailViewProps) {
  const toast = useToast();
  // useClassContext may be unavailable if this view is mounted outside
  // ClassLayout; guard so the view still renders without J/K navigation.
  let courseShortCode: string | null;
  try {
    const ctx = useClassContext();
    courseShortCode = ctx.cls.short_code ?? null;
  } catch {
    courseShortCode = null;
  }

  const [reviewOpen, setReviewOpen] = useState(true);

  const {
    data,
    loading,
    error,
    feedbackHtml,
    scoreOverride,
    setScoreOverride,
    gradedAt,
    savingFeedback,
    flushFeedback,
    persistScoreOverride,
    onChangeFeedback,
    onBlurScoreOverride,
    onToggleGraded,
  } = useAttemptGrading(attemptId, onAssignmentTitle);

  const { navInfo, navigateToSibling } = useSiblingNav(
    data,
    attemptId,
    courseShortCode,
  );

  const onSaveAndNext = useCallback(async () => {
    await flushFeedback(true);
    await persistScoreOverride();
    if (navInfo.nextId) {
      navigateToSibling(navInfo.nextId);
      toast.success("Saved · next student");
    } else {
      toast.success("Saved");
    }
  }, [
    flushFeedback,
    persistScoreOverride,
    navInfo.nextId,
    navigateToSibling,
    toast,
  ]);

  useAttemptKeyboard({
    flushFeedback,
    persistScoreOverride,
    onSaveAndNext,
    prevId: navInfo.prevId,
    nextId: navInfo.nextId,
    navigateToSibling,
  });

  // ---------------------------------------------------------------------------
  // Per-question status + skill tallies, derived from the snapshot (no extra
  // SELECTs). These useMemos sit ABOVE the loading/error early returns and read
  // `data` null-safely. The hook order MUST stay constant between renders.
  // ---------------------------------------------------------------------------
  const perQuestionRows = useMemo(
    () => computePerQuestionRows(data),
    [data?.questions, data?.answers],
  );

  const skillTallies = useMemo(
    () => computeSkillTallies(perQuestionRows),
    [perQuestionRows],
  );

  const hasSkillData = useMemo(() => computeHasSkillData(data), [data?.questions]);

  const avgSecondsPerQuestion = useMemo(
    () => computeAvgSecondsPerQuestion(data),
    [data?.durationSeconds, data?.totalQuestions, data?.result],
  );

  if (loading) {
    return <LoadingState />;
  }

  if (error || !data) {
    return <ErrorState error={error} onBack={onBack} />;
  }

  const cbCount = data.questions.filter((q) => q.source === "cb").length;
  const satCount = data.questions.filter((q) => q.source === "sat").length;

  const studentLabel =
    data.studentDisplayName ?? data.studentEmail ?? "Unknown student";
  const autoScore = data.scorePercent;
  const positionLabel =
    navInfo.index >= 0 && navInfo.total > 0
      ? `Student ${navInfo.index + 1} of ${navInfo.total}`
      : null;
  const isGraded = gradedAt !== null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 px-2 py-1 min-h-[40px]"
          >
            <span aria-hidden>←</span> Back to attempts
          </button>
          {positionLabel && (
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <button
                type="button"
                onClick={() => navInfo.prevId && navigateToSibling(navInfo.prevId)}
                disabled={!navInfo.prevId}
                className="rounded-md px-3 py-2 min-h-[40px] text-xs font-medium ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Previous student (K)"
                aria-label="Previous student"
              >
                ← Prev
              </button>
              <span className="tabular-nums">{positionLabel}</span>
              <button
                type="button"
                onClick={() => navInfo.nextId && navigateToSibling(navInfo.nextId)}
                disabled={!navInfo.nextId}
                className="rounded-md px-3 py-2 min-h-[40px] text-xs font-medium ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Next student (J)"
                aria-label="Next student"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        <header className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-1">
          <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
            Attempt detail
          </p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Student: {studentLabel}
          </h1>
          {data.studentDisplayName && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {data.studentEmail}
            </p>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data.assignmentTitle} · Submitted{" "}
            {formatAttemptTimestamp(data.submittedAt)}
          </p>
        </header>

        <ResultBreakdown
          data={data}
          avgSecondsPerQuestion={avgSecondsPerQuestion}
          cbCount={cbCount}
          satCount={satCount}
        />

        {/* Skill tally — collapsible. Useful for "you missed both word-problem
            questions" feedback. Default-closed to keep the page scannable. */}
        {hasSkillData && data.questions.length > 0 && (
          <SkillTallySection skillTallies={skillTallies} />
        )}

        {/* Per-question detail — collapsible. Per-question TIMING (answer_time_ms /
            time_spent_ms / revisit_count) only exists on `test_answers` for
            mock tests (migrations 0042–0043). Assignment attempts only persist
            an aggregate `duration_seconds`, so we render correctness here and
            surface a clear note about the timing gap. */}
        {data.questions.length > 0 && (
          <PerQuestionSection perQuestionRows={perQuestionRows} />
        )}

        {/* Grading panel */}
        <GradingPanel
          savingFeedback={savingFeedback}
          isGraded={isGraded}
          gradedAt={gradedAt}
          feedbackHtml={feedbackHtml}
          onChangeFeedback={onChangeFeedback}
          flushFeedback={flushFeedback}
          scoreOverride={scoreOverride}
          setScoreOverride={setScoreOverride}
          onBlurScoreOverride={onBlurScoreOverride}
          autoScore={autoScore}
          onToggleGraded={onToggleGraded}
          onSaveAndNext={onSaveAndNext}
          canSaveAndNext={!!navInfo.nextId}
        />

        {data.questions.length > 0 ? (
          <AnswerReview
            questions={data.questions}
            answers={data.answers}
            open={reviewOpen}
            onToggle={() => setReviewOpen((open) => !open)}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">
            Per-question review is unavailable for this attempt (no question
            snapshot was saved).
          </div>
        )}
      </div>
    </div>
  );
}
