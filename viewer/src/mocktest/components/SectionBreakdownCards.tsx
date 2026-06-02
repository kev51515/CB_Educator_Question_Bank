/**
 * SectionBreakdownCards — per-domain and per-difficulty summary cards.
 *
 * On first pass the "section" concept is replaced by "domain" since the
 * unified `TestQuestion` does not split into R&W vs Math.
 */
import type { DomainBreakdown, DifficultyBreakdown } from "../types";
import { pct } from "./resultsHelpers";

interface SectionBreakdownCardsProps {
  byDomain: DomainBreakdown[];
  byDifficulty: DifficultyBreakdown[];
}

export function SectionBreakdownCards({ byDomain, byDifficulty }: SectionBreakdownCardsProps) {
  if (byDomain.length === 0 && byDifficulty.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <BreakdownCard title="By Domain" rows={byDomain.map((d) => ({ label: d.domain, correct: d.correct, total: d.total }))} />
      <BreakdownCard
        title="By Difficulty"
        rows={byDifficulty.map((d) => ({ label: d.difficulty, correct: d.correct, total: d.total }))}
      />
    </div>
  );
}

interface BreakdownCardProps {
  title: string;
  rows: { label: string; correct: number; total: number }[];
}

function BreakdownCard({ title, rows }: BreakdownCardProps) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4">
      <p className="text-sm font-semibold text-slate-500 mb-2">{title}</p>
      <ul className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-2">
            <span className="truncate text-slate-700 dark:text-slate-200" title={r.label}>
              {r.label}
            </span>
            <span className="text-xs text-slate-500 shrink-0">
              {r.correct}/{r.total} · {pct(r.correct, r.total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
