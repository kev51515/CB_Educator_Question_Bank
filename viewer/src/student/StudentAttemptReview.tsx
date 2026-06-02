/**
 * StudentAttemptReview
 * ====================
 * Read-only view of a single submitted assignment_attempts row. Loads the
 * persisted answers + result_detail (which includes the inlined question
 * snapshot — see `lib/attemptReview.ts` for why), then renders the score
 * hero, breakdowns, and the per-question answer review.
 *
 * No retake / re-submit affordances — MVP is one-attempt-per-assignment and
 * we don't want the student to think they can re-grade.
 */
import { useEffect, useState } from "react";
import {
  fetchAttemptReview,
  formatAttemptTimestamp,
  type AttemptReviewData,
} from "../lib/attemptReview";
import { SafeHtml } from "../components/SafeHtml";
import { supabase } from "../lib/supabase";
import { AnswerReview } from "../mocktest/components/AnswerReview";
import { ModuleBreakdownTable } from "../mocktest/components/ModuleBreakdownTable";
import { ScoreHero } from "../mocktest/components/ScoreHero";
import { SectionBreakdownCards } from "../mocktest/components/SectionBreakdownCards";
import { SkillBreakdownCard } from "../mocktest/components/SkillBreakdownCard";

// Local relative-time formatter — mirrors the dashboard's `timeAgo` so the
// student sees the same phrasing as teachers/staff elsewhere ("3h ago",
// "2d ago"). We keep it local rather than dragging in NeedsAttentionPanel's
// helper since that module pulls in dashboard concerns we don't need here.
function gradedTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return seconds <= 5 ? "just now" : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

interface StudentAttemptReviewProps {
  attemptId: string;
  onExit: () => void;
}

export function StudentAttemptReview({
  attemptId,
  onExit,
}: StudentAttemptReviewProps) {
  const [data, setData] = useState<AttemptReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(true);
  // Resolved teacher display name for the "Teacher feedback" card. Looked
  // up lazily when feedback is present so we don't pay the round-trip for
  // ungraded attempts.
  const [graderName, setGraderName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data: fetched, error: fetchError } = await fetchAttemptReview(
        attemptId,
      );
      if (cancelled) return;
      setData(fetched);
      setError(fetchError);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  // Lazy-fetch the grader's display_name when feedback is present. RLS
  // grants every authenticated user SELECT on profiles, so this is one
  // safe round-trip. We don't surface failures — the card just falls back
  // to "your teacher" if the lookup errors.
  useEffect(() => {
    let cancelled = false;
    if (!data?.graderId || !data.feedbackText) {
      setGraderName(null);
      return;
    }
    void (async () => {
      const { data: row } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.graderId)
        .maybeSingle();
      if (cancelled) return;
      setGraderName((row as { display_name: string | null } | null)?.display_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.graderId, data?.feedbackText]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500 dark:text-slate-400">
        Loading your attempt…
      </div>
    );
  }

  if (error || !data) {
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
            onClick={onExit}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const hasResult = data.result !== null;
  const cbCount = data.questions.filter((q) => q.source === "cb").length;
  const satCount = data.questions.filter((q) => q.source === "sat").length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <span aria-hidden>←</span> Back
        </button>

        <header className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-1">
          <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
            Assignment review
          </p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {data.assignmentTitle}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Submitted {formatAttemptTimestamp(data.submittedAt)}
          </p>
        </header>

        {hasResult && data.result ? (
          <>
            {data.feedbackText && data.gradedAt && (
              <section
                aria-label="Teacher feedback"
                className="rounded-2xl bg-white dark:bg-slate-900 ring-2 ring-indigo-300 dark:ring-indigo-800 p-5 space-y-2"
              >
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-semibold">
                      Teacher feedback
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Graded {gradedTimeAgo(data.gradedAt)} by{" "}
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {graderName ?? "your teacher"}
                      </span>
                    </p>
                  </div>
                </header>
                <div className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200">
                  <SafeHtml html={data.feedbackText} />
                </div>
              </section>
            )}
            <ScoreHero
              scorePercent={data.result.scorePercent}
              correctCount={data.result.correctCount}
              totalQuestions={data.result.totalQuestions}
              scoreOverride={data.scoreOverride}
            />
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
        ) : (
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 text-sm text-slate-600 dark:text-slate-400">
            Aggregate breakdowns are unavailable for this attempt.
          </div>
        )}

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
