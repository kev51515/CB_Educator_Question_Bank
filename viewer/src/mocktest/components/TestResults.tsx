/**
 * TestResults — post-test score display and answer review.
 *
 * The orchestrator computes the `TestResult` and passes the question set +
 * raw answers map so this component can render the per-question review.
 */
import { useMemo, useState } from "react";
import type { Letter, TestQuestion, TestResult } from "../types";
import { AnswerReview } from "./AnswerReview";
import { ModuleBreakdownTable } from "./ModuleBreakdownTable";
import { ResultsActions } from "./ResultsActions";
import { ScoreHero } from "./ScoreHero";
import { SectionBreakdownCards } from "./SectionBreakdownCards";
import { SkillBreakdownCard } from "./SkillBreakdownCard";

interface TestResultsProps {
  result: TestResult;
  questions: TestQuestion[];
  answers: Record<string, Letter | null>;
  onRetake: () => void;
  onClose: () => void;
}

export function TestResults({
  result,
  questions,
  answers,
  onRetake,
  onClose,
}: TestResultsProps) {
  const [reviewOpen, setReviewOpen] = useState(false);

  const sourceCounts = useMemo(() => {
    let cb = 0;
    let sat = 0;
    for (const q of questions) {
      if (q.source === "cb") cb += 1;
      else sat += 1;
    }
    return { cb, sat };
  }, [questions]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <ScoreHero
          scorePercent={result.scorePercent}
          correctCount={result.correctCount}
          totalQuestions={result.totalQuestions}
        />
        <SectionBreakdownCards byDomain={result.byDomain} byDifficulty={result.byDifficulty} />
        <ModuleBreakdownTable
          durationSeconds={result.durationSeconds}
          totalQuestions={result.totalQuestions}
          cbCount={sourceCounts.cb}
          satCount={sourceCounts.sat}
        />
        <SkillBreakdownCard bySkill={result.bySkill} />
        <AnswerReview
          questions={questions}
          answers={answers}
          open={reviewOpen}
          onToggle={() => setReviewOpen((open) => !open)}
        />
        <ResultsActions onRetake={onRetake} onClose={onClose} />
      </div>
    </div>
  );
}
