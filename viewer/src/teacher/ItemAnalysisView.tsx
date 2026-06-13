/**
 * ItemAnalysisView — Cohort Distractor Analytics for one mocktest assignment
 * ==========================================================================
 * Per-question item analysis: question #, domain tag, raw response count,
 * %-correct (red badge < 50%), and per-choice horizontal bars where the
 * correct choice is emerald and the most-chosen wrong answer (the flagged
 * top distractor) is amber. Sortable by question order or by %-correct
 * (hardest first) to surface the items the class struggled with.
 *
 * Data: useCohortItemAnalysis → get_cohort_item_analysis (0245). The RPC
 * returns [] for non-mocktest assignments, which renders the empty state.
 */
import { useMemo, useState } from "react";
import { SkeletonRows } from "@/components/Skeleton";
import {
  useCohortItemAnalysis,
  type ChoiceLetter,
  type ItemAnalysisRow,
} from "./useCohortItemAnalysis";

const LETTERS: ChoiceLetter[] = ["A", "B", "C", "D"];

type SortMode = "order" | "hardest";

function pctBadge(pct: number | null): JSX.Element {
  if (pct === null) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">no responses</span>;
  }
  const low = pct < 50;
  const cls = low
    ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ${cls}`}>
      {Math.round(pct)}%
    </span>
  );
}

function ChoiceBar({
  letter,
  count,
  total,
  isCorrect,
  isTopDistractor,
}: {
  letter: ChoiceLetter;
  count: number;
  total: number;
  isCorrect: boolean;
  isTopDistractor: boolean;
}): JSX.Element {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const barCls = isCorrect
    ? "bg-emerald-500 dark:bg-emerald-500"
    : isTopDistractor
      ? "bg-amber-500 dark:bg-amber-500"
      : "bg-slate-300 dark:bg-slate-600";
  const labelCls = isCorrect
    ? "text-emerald-700 dark:text-emerald-300"
    : isTopDistractor
      ? "text-amber-700 dark:text-amber-300"
      : "text-slate-500 dark:text-slate-400";
  return (
    <div className="flex items-center gap-2">
      <span className={`w-4 shrink-0 text-xs font-semibold ${labelCls}`}>{letter}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded transition-all ${barCls}`}
          style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {count}
        {total > 0 && <span className="text-slate-400 dark:text-slate-500"> · {Math.round(pct)}%</span>}
      </span>
      {isCorrect && (
        <span className="w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="correct answer" title="Correct answer">
          ✓
        </span>
      )}
      {!isCorrect && <span className="w-4 shrink-0" aria-hidden />}
    </div>
  );
}

function ItemRow({ row }: { row: ItemAnalysisRow }): JSX.Element {
  return (
    <li className="rounded-xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {row.question_number}
            </span>
            {row.domain && (
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900">
                {row.domain}
              </span>
            )}
          </div>
          {row.prompt_excerpt && (
            <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{row.prompt_excerpt}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {row.n_responses} {row.n_responses === 1 ? "response" : "responses"}
          </span>
          {pctBadge(row.pct_correct)}
        </div>
      </div>
      <div className="space-y-1.5">
        {LETTERS.map((letter) => (
          <ChoiceBar
            key={letter}
            letter={letter}
            count={row.choice_counts[letter] ?? 0}
            total={row.n_responses}
            isCorrect={row.correct_answer === letter}
            isTopDistractor={row.top_distractor === letter}
          />
        ))}
      </div>
      {row.top_distractor && row.top_distractor !== row.correct_answer && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Top distractor: <span className="font-semibold">{row.top_distractor}</span>
        </p>
      )}
    </li>
  );
}

export function ItemAnalysisView({ assignmentId }: { assignmentId: string }): JSX.Element {
  const { rows, loading, error } = useCohortItemAnalysis(assignmentId);
  const [sort, setSort] = useState<SortMode>("order");

  const sorted = useMemo(() => {
    if (sort === "order") return rows;
    return [...rows].sort((a, b) => {
      const av = a.pct_correct ?? Number.POSITIVE_INFINITY;
      const bv = b.pct_correct ?? Number.POSITIVE_INFINITY;
      if (av !== bv) return av - bv;
      return a.position - b.position;
    });
  }, [rows, sort]);

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-3">
        <SkeletonRows count={4} rowClassName="h-28 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No item data yet</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Item analysis is available for Practice Test assignments once students submit.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {rows.length} {rows.length === 1 ? "question" : "questions"} · correct answer in{" "}
          <span className="font-medium text-emerald-600 dark:text-emerald-400">emerald</span>, top distractor in{" "}
          <span className="font-medium text-amber-600 dark:text-amber-400">amber</span>
        </p>
        <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
          <button
            type="button"
            onClick={() => setSort("order")}
            className={`px-3 py-1 text-xs font-medium transition ${
              sort === "order"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
            aria-pressed={sort === "order"}
          >
            Question order
          </button>
          <button
            type="button"
            onClick={() => setSort("hardest")}
            className={`px-3 py-1 text-xs font-medium transition ${
              sort === "hardest"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
            aria-pressed={sort === "hardest"}
          >
            Hardest first
          </button>
        </div>
      </div>
      <ul className="space-y-3">
        {sorted.map((row) => (
          <ItemRow key={row.position} row={row} />
        ))}
      </ul>
    </div>
  );
}
