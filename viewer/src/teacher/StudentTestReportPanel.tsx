/**
 * StudentTestReportPanel
 * ======================
 * Teacher coaching view on the student profile: full-test score trajectory
 * (estimated scaled score across attempts) + weakest domains. Reads
 * student_test_report (0088). Renders nothing until the student has a submitted
 * full-length test.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { scaledFromSectionScores, type ScaledReport } from "@/fulltest/satScore";
import { band, orderDomains, orderSections, pctOf, sectionForDomain, sectionLabel } from "@/fulltest/skills";

interface RunRow {
  run_id: string;
  test_title: string;
  submitted_at: string | null;
  score: number | null;
  total: number | null;
  section_scores: Record<string, { correct: number; total: number }> | null;
}
interface DomainRow {
  domain: string;
  correct: number;
  total: number;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

/** Tiny inline sparkline of scaled totals (400–1600) across attempts. */
function Trend({ totals }: { totals: number[] }) {
  if (totals.length < 2) return null;
  const W = 180;
  const H = 36;
  const lo = 400;
  const hi = 1600;
  const x = (i: number) => (totals.length === 1 ? 0 : (i / (totals.length - 1)) * (W - 4) + 2);
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo)) * (H - 4);
  const pts = totals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={W} height={H} className="overflow-visible" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-indigo-500"
      />
      {totals.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.5} className="fill-indigo-500" />
      ))}
    </svg>
  );
}

export function StudentTestReportPanel({ studentId }: { studentId: string | null }) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!studentId) {
      setLoaded(true);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.rpc("student_test_report", {
          p_student_id: studentId,
        });
        if (!alive) return;
        const d = (data ?? {}) as { runs?: RunRow[]; domains?: DomainRow[] };
        setRuns(d.runs ?? []);
        setDomains(d.domains ?? []);
      } catch {
        /* non-fatal */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [studentId]);

  // Full per-section domain breakdown (domains are section-exclusive, so we can
  // group by section client-side without the RPC returning one).
  const grouped = useMemo(() => {
    const bySection = new Map<string, Map<string, DomainRow>>();
    for (const d of domains) {
      if (!d.total) continue;
      const sec = sectionForDomain(d.domain);
      if (!sec) continue;
      if (!bySection.has(sec)) bySection.set(sec, new Map());
      bySection.get(sec)!.set(d.domain, d);
    }
    return orderSections(bySection.keys()).map((sec) => {
      const byName = bySection.get(sec)!;
      return {
        section: sec,
        domains: orderDomains(sec, byName.keys()).map((name) => {
          const r = byName.get(name)!;
          return { domain: name, correct: r.correct, total: r.total, pct: pctOf(r.correct, r.total) ?? 0 };
        }),
      };
    });
  }, [domains]);

  if (!loaded) return null;

  const scaled = runs
    .map((r) => ({ run: r, s: scaledFromSectionScores(r.section_scores) }))
    .filter((x): x is { run: RunRow; s: ScaledReport & { total: number } } => x.s.total !== null);
  const allDomains = grouped.flatMap((g) => g.domains);
  const hasDomains = allDomains.length > 0;
  // Focus area = weakest domain with a meaningful sample, mirroring the student view.
  const focus = allDomains
    .filter((d) => d.total >= 3)
    .reduce<(typeof allDomains)[number] | null>((w, d) => (!w || d.pct < w.pct ? d : w), null);

  if (scaled.length === 0 && !hasDomains) return null;

  const totals = scaled.map((x) => x.s.total);
  const latest = scaled[scaled.length - 1];
  const first = scaled[0];
  const delta = latest && first ? latest.s.total - first.s.total : 0;

  return (
    <section
      aria-labelledby="test-report-title"
      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-4"
    >
      <h2
        id="test-report-title"
        className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
      >
        Test performance
      </h2>

      {scaled.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {latest.s.total}
              </span>
              <span className="pb-1 text-sm text-slate-500 dark:text-slate-400">/ 1600 est.</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              RW {latest.s.rw ?? "—"} · Math {latest.s.math ?? "—"}
              {scaled.length > 1 && (
                <span
                  className={`ml-2 font-medium ${delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                >
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} since first
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-start">
            <Trend totals={totals} />
            <span className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {scaled.length} attempt{scaled.length === 1 ? "" : "s"} ·{" "}
              {fmtDate(first.run.submitted_at)}→{fmtDate(latest.run.submitted_at)}
            </span>
          </div>
        </div>
      )}

      {hasDomains && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Skills by domain
            </p>
            {focus && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Focus:{" "}
                <span
                  className="rounded px-1.5 py-0.5 font-semibold"
                  style={{ backgroundColor: band(focus.pct).bg, color: band(focus.pct).fg }}
                >
                  {focus.domain} · {focus.pct}%
                </span>
              </span>
            )}
          </div>
          {grouped.map((g) => (
            <div key={g.section}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {sectionLabel(g.section)}
              </p>
              <ul className="space-y-1.5">
                {g.domains.map((d) => (
                  <li key={d.domain} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                      {d.domain}
                    </span>
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${d.pct}%`, backgroundColor: band(d.pct).bg }}
                      />
                    </span>
                    <span className="w-16 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">
                      {d.correct}/{d.total} ({d.pct}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
