/**
 * SkillHeatmap
 * ============
 * Per-student per-skill mastery heatmap. Calls the `my_skill_mastery` RPC
 * (see migration 0024) which returns one row per (domain, skill) the student
 * has touched, with attempts/correct counts and a 0-100 mastery percentage.
 *
 * The view groups rows by domain and renders each skill as a hairline row
 * with ten "mastery squares" (the Ivy Ledger brand visual) in four fill
 * states derived from the 0-100 mastery value, plus a mono percent.
 *
 * Wave 22 additions:
 *   - Domain filter pills (tablist) — quickly scope to Math / Reading / Writing
 *   - Sort dropdown — Default, Weakest first, Strongest first, Most attempts,
 *     Skill name
 *   - "Weakest skill" callout — always reflects the single lowest-mastery
 *     skill across ALL skills (independent of filter/sort)
 *   - localStorage persistence per user
 *   - Empty filtered state with "Show all" recovery action
 *
 * Controlled-access model (2026-06-03): this is a READ-ONLY insight surface.
 * Students can't self-assign practice — they only do what the teacher assigns
 * — so the old "Practice this skill" / drill-cell links to /practice were
 * removed (that route just bounces students home now). The cells and the
 * weakest-skill callout are informational only.
 *
 * Self-contained: no props, reads from the supabase singleton, identifies the
 * caller via the RPC (which uses auth.uid()).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Combobox } from "@/components";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";

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

type SortKey =
  | "default"
  | "weakest"
  | "strongest"
  | "attempts"
  | "skill";

interface PersistedView {
  domain: string;
  sort: SortKey;
}

const ALL_DOMAINS = "__all__";
const OTHER_DOMAIN = "Other";
const SORT_KEYS: ReadonlyArray<SortKey> = [
  "default",
  "weakest",
  "strongest",
  "attempts",
  "skill",
];
const SORT_LABEL: Record<SortKey, string> = {
  default: "Default order",
  weakest: "Weakest first",
  strongest: "Strongest first",
  attempts: "Most attempts",
  skill: "Skill name",
};

function toNumber(value: number | string | null): number {
  if (value === null) return 0;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mastery squares (the Ivy Ledger brand visual): ten small rounded squares
 * per skill, each in one of four fill states derived from the 0-100 mastery
 * value. Square i fills progressively as mastery crosses i*10:
 *   fully past  → mastered (deep accent)
 *   half past   → proficient (mid accent)
 *   just past   → attempted (light accent)
 *   not reached → untouched (sunken outline)
 */
type MasterySquareState = "mastered" | "proficient" | "attempted" | "untouched";

const MSQ_CLASSES: Record<MasterySquareState, string> = {
  mastered: "bg-accent-700 dark:bg-accent-400",
  proficient: "bg-accent-400 dark:bg-accent-600",
  attempted: "bg-accent-200 dark:bg-accent-900",
  untouched:
    "bg-slate-100 ring-1 ring-inset ring-slate-200 dark:bg-slate-800/80 dark:ring-slate-700",
};

function masterySquareStates(mastery: number): MasterySquareState[] {
  const v = Math.max(0, Math.min(100, mastery)) / 10;
  return Array.from({ length: 10 }, (_, i) => {
    const fill = v - i;
    if (fill >= 1) return "mastered";
    if (fill >= 0.5) return "proficient";
    if (fill > 0) return "attempted";
    return "untouched";
  });
}

function MasterySquares({ mastery }: { mastery: number }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-1">
      {masterySquareStates(mastery).map((state, i) => (
        <i
          key={i}
          className={`block h-[13px] w-[13px] rounded-[3.5px] ${MSQ_CLASSES[state]}`}
        />
      ))}
    </span>
  );
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
    const key = row.domain || OTHER_DOMAIN;
    const existing = byDomain.get(key);
    if (existing) {
      existing.push(row);
    } else {
      byDomain.set(key, [row]);
    }
  }
  return Array.from(byDomain.entries()).map(([domain, groupRows]) => ({
    domain,
    rows: groupRows,
  }));
}

function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (SORT_KEYS as readonly string[]).includes(value);
}

function loadPersistedView(userId: string | null): PersistedView {
  const fallback: PersistedView = { domain: ALL_DOMAINS, sort: "default" };
  if (!userId) return fallback;
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(
      `student.skillHeatmap.view:${userId}`,
    );
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "domain" in parsed &&
      "sort" in parsed
    ) {
      const dom = (parsed as { domain: unknown }).domain;
      const srt = (parsed as { sort: unknown }).sort;
      return {
        domain: typeof dom === "string" ? dom : ALL_DOMAINS,
        sort: isSortKey(srt) ? srt : "default",
      };
    }
  } catch {
    /* corrupt storage — ignore */
  }
  return fallback;
}

function persistView(userId: string | null, view: PersistedView): void {
  if (!userId) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `student.skillHeatmap.view:${userId}`,
      JSON.stringify(view),
    );
  } catch {
    /* quota or disabled — silent */
  }
}

function sortRows(
  rows: readonly SkillMasteryRow[],
  sort: SortKey,
): SkillMasteryRow[] {
  if (sort === "default") return [...rows];
  const out = [...rows];
  switch (sort) {
    case "weakest":
      out.sort((a, b) => a.mastery - b.mastery);
      break;
    case "strongest":
      out.sort((a, b) => b.mastery - a.mastery);
      break;
    case "attempts":
      out.sort((a, b) => b.attempts - a.attempts);
      break;
    case "skill":
      out.sort((a, b) => a.skill.localeCompare(b.skill));
      break;
  }
  return out;
}

export function SkillHeatmap() {
  const [rows, setRows] = useState<SkillMasteryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<PersistedView>({
    domain: ALL_DOMAINS,
    sort: "default",
  });
  const [viewHydrated, setViewHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const toast = useToast();

  // Hydrate persisted view once we know the user id
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const uid = data.user?.id ?? null;
        setUserId(uid);
        setView(loadPersistedView(uid));
      } finally {
        if (!cancelled) setViewHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save view whenever it changes (after hydration so we don't clobber)
  useEffect(() => {
    if (!viewHydrated) return;
    persistView(userId, view);
  }, [userId, view, viewHydrated]);

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

  // Derive domain pills from data (stable order: original group order, then "Other" last)
  const domainPills = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of rows) {
      const key = row.domain || OTHER_DOMAIN;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const entries = Array.from(seen.entries());
    // Keep "Other" pinned to the end if present
    entries.sort((a, b) => {
      if (a[0] === OTHER_DOMAIN && b[0] !== OTHER_DOMAIN) return 1;
      if (b[0] === OTHER_DOMAIN && a[0] !== OTHER_DOMAIN) return -1;
      return 0;
    });
    return entries.map(([domain, count]) => ({ domain, count }));
  }, [rows]);

  // Weakest skill across ALL rows (independent of filter/sort)
  const weakest = useMemo<SkillMasteryRow | null>(() => {
    if (rows.length === 0) return null;
    return rows.reduce((min, r) => (r.mastery < min.mastery ? r : min), rows[0]);
  }, [rows]);

  // Apply filter + sort for the rendered groups
  const filteredGroups = useMemo<DomainGroup[]>(() => {
    const filtered =
      view.domain === ALL_DOMAINS
        ? rows
        : rows.filter((r) => (r.domain || OTHER_DOMAIN) === view.domain);
    const groups = groupByDomain(filtered);
    return groups.map((g) => ({
      domain: g.domain,
      rows: sortRows(g.rows, view.sort),
    }));
  }, [rows, view.domain, view.sort]);

  const filteredCount = filteredGroups.reduce((n, g) => n + g.rows.length, 0);
  const activeDomainLabel =
    view.domain === ALL_DOMAINS ? "All domains" : view.domain;

  const handleDomainSelect = (domain: string): void => {
    setView((prev) => ({ ...prev, domain }));
    const label = domain === ALL_DOMAINS ? "All domains" : domain;
    setAnnouncement(`Filtered to ${label}`);
  };

  const handleSortChange = (next: string): void => {
    if (isSortKey(next)) {
      setView((prev) => ({ ...prev, sort: next }));
      setAnnouncement(`Sorted by ${SORT_LABEL[next]}`);
    }
  };

  return (
    <section
      aria-labelledby="skill-mastery-title"
      className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-700 p-5 shadow-card"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id="skill-mastery-title"
          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400"
        >
          Skill mastery
        </h3>
        {rows.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {rows.length} skills
          </span>
        )}
      </div>

      {/* sr-only live region for filter/sort announcements */}
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

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

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title="No skill mastery yet"
          body="Complete assignments to see your skill mastery."
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          {/* Weakest skill callout */}
          {weakest && (
            <div
              role="status"
              aria-label={`Weakest skill: ${weakest.skill} at ${weakest.mastery}% mastery`}
              className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/50 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2"
            >
              <span className="inline-flex min-h-[24px] items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 text-[11px] font-semibold tracking-[0.02em] text-amber-800 dark:text-amber-300">
                Focus here
              </span>
              <div className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100">
                <span className="font-semibold">{weakest.skill}</span>{" "}
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  · {weakest.mastery}% mastery ·{" "}
                  {weakest.correct}/{weakest.attempts} correct
                </span>
              </div>
            </div>
          )}

          {/* Filter pills + sort */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div
              role="tablist"
              aria-label="Filter by domain"
              className="flex flex-wrap gap-1.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view.domain === ALL_DOMAINS}
                onClick={() => handleDomainSelect(ALL_DOMAINS)}
                className={`motion-safe:transition-colors min-h-[40px] inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1 ${
                  view.domain === ALL_DOMAINS
                    ? "bg-accent-700 text-white ring-1 ring-accent-800"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                All
                <span className="ml-1.5 opacity-80 tabular-nums">({rows.length})</span>
              </button>
              {domainPills.map(({ domain, count }) => {
                const selected = view.domain === domain;
                return (
                  <button
                    key={domain}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => handleDomainSelect(domain)}
                    className={`motion-safe:transition-colors min-h-[40px] inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1 ${
                      selected
                        ? "bg-accent-700 text-white ring-1 ring-accent-800"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {domain}
                    <span className="ml-1.5 opacity-80 tabular-nums">({count})</span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto">
              <label className="sr-only" htmlFor="skill-heatmap-sort">
                Sort skills
              </label>
              <Combobox
                id="skill-heatmap-sort"
                ariaLabel="Sort skills"
                value={view.sort}
                onChange={handleSortChange}
                options={SORT_KEYS.map((k) => ({
                  value: k,
                  label: SORT_LABEL[k],
                }))}
                className="min-w-[10rem]"
              />
            </div>
          </div>

          {/* Filtered empty state */}
          {filteredCount === 0 && (
            <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 p-4 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                No skills in {activeDomainLabel}.
              </p>
              <button
                type="button"
                onClick={() => handleDomainSelect(ALL_DOMAINS)}
                className="motion-safe:transition-colors mt-2 inline-flex min-h-[40px] items-center rounded-lg bg-accent-700 hover:bg-accent-800 text-white text-xs font-semibold px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1"
              >
                Show all
              </button>
            </div>
          )}

          {/* Mastery-square rows per domain group (Ivy Ledger brand visual) */}
          {filteredCount > 0 && (
            <div className="mt-4 space-y-4">
              {filteredGroups.map((group) => (
                <div key={group.domain}>
                  <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    {group.domain}
                  </h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.rows.map((row) => (
                      <div
                        key={`${group.domain}::${row.skill}`}
                        className="flex min-h-[46px] flex-wrap items-center gap-x-3.5 gap-y-1 py-1.5"
                        title={`${row.skill}: ${row.correct}/${row.attempts} correct`}
                        aria-label={`${row.skill} — current mastery ${row.mastery}%`}
                      >
                        <span className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-slate-800 dark:text-slate-100">
                          {row.skill}
                        </span>
                        <MasterySquares mastery={row.mastery} />
                        <span className="w-10 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                          {row.mastery}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Legend footer — square states, mirrored from the mockup. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3 text-[11.5px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <i className={`block h-[13px] w-[13px] rounded-[3.5px] ${MSQ_CLASSES.mastered}`} />
                  Mastered
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className={`block h-[13px] w-[13px] rounded-[3.5px] ${MSQ_CLASSES.proficient}`} />
                  Proficient
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className={`block h-[13px] w-[13px] rounded-[3.5px] ${MSQ_CLASSES.attempted}`} />
                  Attempted
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className={`block h-[13px] w-[13px] rounded-[3.5px] ${MSQ_CLASSES.untouched}`} />
                  Untouched
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
