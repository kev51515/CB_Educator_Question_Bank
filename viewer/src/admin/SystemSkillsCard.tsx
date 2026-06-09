/**
 * SystemSkillsCard — cohort-wide SAT skill health (admin Overview)
 * ===============================================================
 * Per-domain %-correct across every full-length test every student has taken
 * (latest attempt per student per test) — a program-level "where are our
 * students weakest?" signal. Reads the admin-only `system_skill_mastery` RPC
 * (0128) and renders with the shared skill palette/grouping (fulltest/skills).
 * Self-hides until there's test data.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/Skeleton";
import {
  band,
  groupDomainRows,
  sectionLabel,
  weakestDomain,
  type SkillDomainRow,
} from "@/fulltest/skills";

interface SystemMastery {
  students: number;
  tests: number;
  attempts: number;
  domains: SkillDomainRow[];
}

export function SystemSkillsCard(): JSX.Element | null {
  const [data, setData] = useState<SystemMastery | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const alive = { current: true };
    void (async () => {
      try {
        const { data: res, error } = await supabase.rpc("system_skill_mastery");
        if (!alive.current) return;
        if (!error) setData(res as SystemMastery);
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, []);

  const grouped = useMemo(() => groupDomainRows(data?.domains ?? []), [data]);
  const weakest = useMemo(() => weakestDomain(grouped), [grouped]);
  const all = grouped.flatMap((g) => g.domains);

  if (loading) return <Skeleton className="h-40 rounded-2xl" />;
  if (all.length === 0) return null;

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Skills across all students
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {data!.tests} test{data!.tests === 1 ? "" : "s"} · {data!.students} student
          {data!.students === 1 ? "" : "s"} · latest attempt per test
          {weakest && (
            <>
              {" · "}weakest:{" "}
              <span
                className="rounded px-1.5 py-0.5 font-semibold"
                style={{ backgroundColor: band(weakest.pct).bg, color: band(weakest.pct).fg }}
              >
                {weakest.domain} {weakest.pct}%
              </span>
            </>
          )}
        </p>
      </div>
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        {grouped.map((g) => (
          <div key={g.section}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {sectionLabel(g.section)}
            </p>
            <div className="space-y-2">
              {g.domains.map((d) => (
                <div key={d.domain} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{d.domain}</span>
                  <span className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <span className="block h-full rounded-full" style={{ width: `${d.pct}%`, backgroundColor: band(d.pct).bg }} />
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
