/**
 * SkillBreakdownCard — per-skill correct/total card with accuracy bars.
 */
import type { SkillBreakdown } from "../types";

interface SkillBreakdownCardProps {
  bySkill: SkillBreakdown[];
}

function colorClass(percent: number): string {
  if (percent >= 80) return "bg-emerald-500";
  if (percent >= 60) return "bg-amber-400";
  return "bg-red-400";
}

export function SkillBreakdownCard({ bySkill }: SkillBreakdownCardProps) {
  if (bySkill.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Skill Breakdown</p>
      <ul className="space-y-2.5">
        {bySkill.map((s) => {
          const percent = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
          return (
            <li key={s.skill} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-200 truncate" title={s.skill}>
                  {s.skill}
                </span>
                <span className="text-slate-500 shrink-0">
                  {s.correct}/{s.total}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${colorClass(percent)}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 shrink-0 w-8 text-right">{percent}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
