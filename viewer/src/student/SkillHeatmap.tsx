/**
 * SkillHeatmap
 * ============
 * Per-student per-skill mastery heatmap. Calls the `my_skill_mastery` RPC
 * (see migration 0024) which returns one row per (domain, skill) the student
 * has touched, with attempts/correct counts and a 0-100 mastery percentage.
 *
 * The view groups rows by domain and renders each skill as a cell colored by
 * mastery band:
 *   >= 85%  emerald
 *   65-84   indigo
 *   40-64   amber
 *   < 40    rose
 *
 * Self-contained: no props, reads from the supabase singleton, identifies the
 * caller via the RPC (which uses auth.uid()).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { ROUTES } from "../lib/routes";

interface SkillMasteryRow {
  domain: string;
  skill: string;
  attempts: number;
  correct: number;
  mastery: number;
}

interface RawRpcRow {
  domain: string | null;
  skill: string | null;
  attempts: number | string | null;
  correct: number | string | null;
  mastery: number | string | null;
}

function toNumber(value: number | string | null): number {
  if (value === null) return 0;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function masteryClasses(mastery: number): string {
  if (mastery >= 85) {
    return "bg-emerald-500/90 text-white ring-emerald-600";
  }
  if (mastery >= 65) {
    return "bg-indigo-500/90 text-white ring-indigo-600";
  }
  if (mastery >= 40) {
    return "bg-amber-400/90 text-slate-900 ring-amber-500";
  }
  return "bg-rose-500/90 text-white ring-rose-600";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load skill mastery.";
}

interface DomainGroup {
  domain: string;
  rows: SkillMasteryRow[];
}

function groupByDomain(rows: readonly SkillMasteryRow[]): DomainGroup[] {
  const byDomain = new Map<string, SkillMasteryRow[]>();
  for (const row of rows) {
    const existing = byDomain.get(row.domain);
    if (existing) {
      existing.push(row);
    } else {
      byDomain.set(row.domain, [row]);
    }
  }
  return Array.from(byDomain.entries()).map(([domain, groupRows]) => ({
    domain,
    rows: groupRows,
  }));
}

export function SkillHeatmap() {
  const [rows, setRows] = useState<SkillMasteryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc("my_skill_mastery");
        if (cancelled) return;
        if (rpcError) {
          setRows([]);
          setError(rpcError.message);
          toast.error("Couldn't load skill mastery", rpcError.message);
          return;
        }
        const raw = (data ?? []) as unknown as RawRpcRow[];
        const mapped: SkillMasteryRow[] = raw
          .filter((r) => r.domain !== null && r.skill !== null)
          .map((r) => ({
            domain: r.domain ?? "",
            skill: r.skill ?? "",
            attempts: toNumber(r.attempts),
            correct: toNumber(r.correct),
            mastery: toNumber(r.mastery),
          }));
        setRows(mapped);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = getErrorMessage(err);
        setRows([]);
        setError(msg);
        toast.error("Couldn't load skill mastery", msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const groups = groupByDomain(rows);

  return (
    <section
      aria-labelledby="skill-mastery-title"
      className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-700 p-5 shadow-sm"
    >
      <div className="flex items-baseline justify-between">
        <h3
          id="skill-mastery-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200"
        >
          Skill mastery
        </h3>
        {rows.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {rows.length} skills
          </span>
        )}
      </div>

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-3 w-24 rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {!loading && error && (
        <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Complete assignments to see your skill mastery.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <div key={group.domain}>
              <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                {group.domain}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.rows.map((row) => (
                  <button
                    key={`${group.domain}::${row.skill}`}
                    type="button"
                    onClick={() => {
                      const qs = new URLSearchParams({ skill: row.skill });
                      navigate(`${ROUTES.PRACTICE}?${qs.toString()}`);
                    }}
                    className={`min-h-[40px] text-left rounded-lg p-2 ring-1 transition-transform hover:-translate-y-0.5 hover:ring-2 focus:outline-none focus:ring-2 focus:ring-offset-1 ${masteryClasses(row.mastery)}`}
                    title={`${row.skill}: ${row.correct}/${row.attempts} correct`}
                    aria-label={`Drill ${row.skill} — current mastery ${row.mastery}%`}
                  >
                    <div className="text-xs font-medium leading-tight line-clamp-2">
                      {row.skill}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-lg font-bold tabular-nums">
                        {row.mastery}%
                      </span>
                      <span className="text-[10px] opacity-80">
                        {row.attempts} att
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
