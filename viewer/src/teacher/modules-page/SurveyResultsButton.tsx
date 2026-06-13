// Teacher-facing "Results" button for a survey module item. Opens a
// ResponsiveModal that loads + aggregates responses via get_survey_results:
//   scale  → count + average + per-value (1..5) distribution bars
//   choice → count + per-option tallies (unknowns under "Other")
//   text   → count + scrollable list of answers
// Tailwind + slate + dark mode.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ResponsiveModal } from "@/components/ResponsiveModal";

type SurveyKind = "scale" | "choice" | "text";

interface SurveyConfig {
  kind?: SurveyKind;
  options?: string[];
}

interface ResultRow {
  answer: number | string;
  created_at: string;
}

function Bar({ label, count, total }: { label: string; count: number; total: number }): JSX.Element {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 flex-none truncate text-slate-600 dark:text-slate-300">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-violet-500 dark:bg-violet-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 flex-none text-right tabular-nums text-slate-500 dark:text-slate-400">{count}</span>
    </div>
  );
}

export function SurveyResultsButton({
  itemId,
  prompt,
  config,
}: {
  itemId: string;
  prompt?: string;
  config: SurveyConfig;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const kind: SurveyKind = config.kind ?? "scale";

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    void (async () => {
      const { data, error } = await supabase.rpc("get_survey_results", { p_item_id: itemId });
      if (!alive) return;
      setLoading(false);
      if (error) {
        setErr(error.message);
        return;
      }
      setRows((data ?? []) as ResultRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [open, itemId]);

  const total = rows.length;

  function body(): JSX.Element {
    if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
    if (err)
      return <p className="text-sm text-rose-600 dark:text-rose-400">Couldn't load results: {err}</p>;
    if (total === 0)
      return <p className="text-sm text-slate-500 dark:text-slate-400">No responses yet.</p>;

    if (kind === "scale") {
      const nums = rows
        .map((r) => (typeof r.answer === "number" ? r.answer : Number(r.answer)))
        .filter((n) => Number.isFinite(n));
      const avg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {total} {total === 1 ? "response" : "responses"} · average{" "}
            <span className="font-semibold tabular-nums">{avg.toFixed(1)}</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Bar key={n} label={String(n)} count={nums.filter((x) => x === n).length} total={total} />
            ))}
          </div>
        </div>
      );
    }

    if (kind === "choice") {
      const options = config.options ?? [];
      const tally = new Map<string, number>(options.map((o) => [o, 0]));
      let other = 0;
      for (const r of rows) {
        const key = String(r.answer);
        if (tally.has(key)) tally.set(key, (tally.get(key) ?? 0) + 1);
        else other += 1;
      }
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {total} {total === 1 ? "response" : "responses"}
          </p>
          <div className="flex flex-col gap-1.5">
            {options.map((o) => (
              <Bar key={o} label={o} count={tally.get(o) ?? 0} total={total} />
            ))}
            {other > 0 ? <Bar label="Other" count={other} total={total} /> : null}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {total} {total === 1 ? "response" : "responses"}
        </p>
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {rows.map((r, i) => (
            <li
              key={`${r.created_at}-${i}`}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200"
            >
              {String(r.answer)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Results
      </button>
      <ResponsiveModal
        open={open}
        onClose={() => setOpen(false)}
        title="Survey results"
        subtitle={prompt}
        size="md"
      >
        {body()}
      </ResponsiveModal>
    </>
  );
}
