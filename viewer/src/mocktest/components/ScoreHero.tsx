/**
 * ScoreHero — large overall score display at the top of `TestResults`.
 *
 * Shows the raw percent, correct/total, and a motivational message.
 *
 * If `scoreOverride` is provided AND differs from `scorePercent`, the override
 * becomes the headline number and a subtle "Adjusted by teacher" pill appears
 * underneath. The original auto-computed score is shown in the pill tooltip
 * so the student knows what changed (and the teacher reading their own UI
 * sees the same signal). This is the M6 "effective score" surfacing path —
 * see migration 0053 + `assignment_attempts_effective` view.
 */
import { motivationalMessage, scoreColor } from "./resultsHelpers";

interface ScoreHeroProps {
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  /** Optional teacher-set override; when non-null and != scorePercent the headline shows it. */
  scoreOverride?: number | null;
}

export function ScoreHero({
  scorePercent,
  correctCount,
  totalQuestions,
  scoreOverride,
}: ScoreHeroProps) {
  const hasOverride =
    scoreOverride !== null &&
    scoreOverride !== undefined &&
    scoreOverride !== scorePercent;
  const headline = hasOverride ? Math.round(scoreOverride!) : scorePercent;
  return (
    <div className="text-center space-y-3">
      <p className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        Test Complete
      </p>
      <div className="space-y-1">
        <div className={`text-7xl font-extrabold leading-none ${scoreColor(headline)}`}>
          {headline}%
        </div>
        <div className="text-lg text-slate-500 dark:text-slate-400 font-medium">
          {correctCount} / {totalQuestions} correct
        </div>
        {hasOverride && (
          <div className="pt-1">
            <span
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5"
              title={`Auto-graded ${scorePercent}% · Teacher set ${Math.round(scoreOverride!)}%`}
            >
              Adjusted by teacher
            </span>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 italic">{motivationalMessage(headline)}</p>
    </div>
  );
}
