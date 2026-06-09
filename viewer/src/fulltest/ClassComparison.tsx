/**
 * ClassComparison (staff Review Mode)
 * ===================================
 * When more than one of a teacher's classes has taken the same test, this
 * overlay puts them side by side: overall, per-section, and per-SAT-domain
 * %-correct, one column per class. Lets a teacher see at a glance which class
 * is weak where ("3rd period is behind on Advanced Math") — the cross-class
 * read the single-class heatmap can't give.
 *
 * Pulls each class's answer breakdown (0112 RPC) in parallel and aggregates
 * client-side against the domains already loaded with the test content. Same
 * emerald/amber/rose band palette as the heatmap; the weakest class in each
 * row is ringed so gaps jump out. Modal contract per CLAUDE.md: role="dialog",
 * focus trap, Esc + backdrop close, ≥40px close target.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Skeleton } from "@/components/Skeleton";
import { downloadCsv } from "@/lib/csv";
import { getAnswerBreakdown, type ReviewCourse } from "./api";
import { band, orderDomains, orderSections, pctOf, sectionLabel } from "./skills";
import type { TestContentModule } from "./testContent";

interface Props {
  slug: string;
  modules: TestContentModule[];
  courses: ReviewCourse[]; // only those with taken > 0
  currentCourseId: string | null;
  onClose: () => void;
}

interface Tally {
  c: number;
  t: number;
}
const tallyPct = (x: Tally | undefined): number | null => (x ? pctOf(x.c, x.t) : null);

interface ClassStat {
  course: ReviewCourse;
  overall: Tally;
  section: Record<string, Tally>;
  domain: Record<string, Tally>;
}

/** A metric row in the table: overall, a section subtotal, or a domain. */
interface Row {
  key: string;
  label: string;
  kind: "overall" | "section" | "domain";
  section?: string;
  domain?: string;
}

export function ClassComparison({ slug, modules, courses, currentCourseId, onClose }: Props): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  const [stats, setStats] = useState<ClassStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // question_id -> { section, domain }, and which domains exist per section.
  const { qMeta, rows } = useMemo(() => {
    const qMeta = new Map<string, { section: string; domain: string | null }>();
    const domainsBySection = new Map<string, Set<string>>();
    const sectionsPresent = new Set<string>();
    for (const m of modules) {
      sectionsPresent.add(m.section);
      for (const q of m.questions) {
        qMeta.set(q.id, { section: m.section, domain: q.domain });
        if (q.domain) {
          if (!domainsBySection.has(m.section)) domainsBySection.set(m.section, new Set());
          domainsBySection.get(m.section)!.add(q.domain);
        }
      }
    }
    const rows: Row[] = [{ key: "overall", label: "Overall", kind: "overall" }];
    for (const sec of orderSections(sectionsPresent)) {
      rows.push({ key: `sec:${sec}`, label: sectionLabel(sec), kind: "section", section: sec });
      const present = domainsBySection.get(sec);
      if (!present) continue;
      for (const d of orderDomains(sec, present))
        rows.push({ key: `dom:${sec}:${d}`, label: d, kind: "domain", section: sec, domain: d });
    }
    return { qMeta, rows };
  }, [modules]);

  useEffect(() => {
    let alive = true;
    setStats(null);
    setError(null);
    void (async () => {
      try {
        const results = await Promise.all(
          courses.map(async (course) => {
            const breakdown = await getAnswerBreakdown(slug, course.course_id);
            const stat: ClassStat = { course, overall: { c: 0, t: 0 }, section: {}, domain: {} };
            for (const r of breakdown) {
              const meta = qMeta.get(r.question_id);
              if (!meta) continue;
              const hit = r.is_correct === true ? 1 : 0;
              stat.overall.t++; stat.overall.c += hit;
              (stat.section[meta.section] ??= { c: 0, t: 0 }).t++;
              stat.section[meta.section].c += hit;
              if (meta.domain) {
                (stat.domain[meta.domain] ??= { c: 0, t: 0 }).t++;
                stat.domain[meta.domain].c += hit;
              }
            }
            return stat;
          }),
        );
        if (alive) setStats(results);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load class results.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, courses, qMeta]);

  const tallyFor = (s: ClassStat, row: Row): Tally | undefined =>
    row.kind === "overall" ? s.overall : row.kind === "section" ? s.section[row.section!] : s.domain[row.domain!];

  const exportCsv = () => {
    if (!stats) return;
    const header = ["Topic", ...stats.map((s) => `${s.course.title} (% correct)`)];
    const body = rows.map((row) => [row.label, ...stats.map((s) => tallyPct(tallyFor(s, row)) ?? "")]);
    downloadCsv(`class-comparison-${slug}.csv`, [header, ...body]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        else if (e.key.startsWith("Arrow")) e.stopPropagation();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[calc(100vh-1.5rem)] w-full max-w-[80rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-7">
          <div>
            <h2 id="compare-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Compare classes
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              % correct by topic — the weakest class in each row is outlined.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {stats && stats.length > 0 && (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Export CSV
              </button>
            )}
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              aria-label="Close comparison"
              className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-5 sm:px-7">
          {error ? (
            <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900">
              {error}
            </p>
          ) : !stats ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading class results">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : (
            <table className="border-collapse text-sm">
              <caption className="sr-only">
                Percent correct by topic, one column per class. The weakest class in each row (when the
                gap is at least 10 points) is outlined.
              </caption>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white py-2 pr-3 text-left align-bottom dark:bg-slate-900" />
                  {stats.map((s) => (
                    <th key={s.course.course_id} className="min-w-[7.5rem] px-2 pb-2 align-bottom">
                      <div
                        className={`truncate text-xs font-semibold ${
                          s.course.course_id === currentCourseId
                            ? "text-indigo-700 dark:text-indigo-300"
                            : "text-slate-700 dark:text-slate-200"
                        }`}
                        title={s.course.title}
                      >
                        {s.course.title}
                      </div>
                      <div className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
                        {s.course.taken} submitted
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pcts = stats.map((s) => tallyPct(tallyFor(s, row)));
                  const valid = pcts.filter((p): p is number => p != null);
                  const min = valid.length >= 2 ? Math.min(...valid) : null;
                  const max = valid.length >= 2 ? Math.max(...valid) : null;
                  const spread = min != null && max != null ? max - min : null;
                  const isHeader = row.kind !== "domain";
                  return (
                    <tr key={row.key} className={row.kind === "section" ? "border-t border-slate-200 dark:border-slate-800" : ""}>
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 bg-white py-1.5 pr-3 text-left font-normal dark:bg-slate-900 ${
                          row.kind === "overall"
                            ? "text-sm font-semibold text-slate-900 dark:text-slate-100"
                            : row.kind === "section"
                              ? "pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                              : "pl-3 text-sm text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {row.label}
                        {spread != null && spread >= 15 && row.kind === "domain" && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            {spread}pt gap
                          </span>
                        )}
                      </th>
                      {stats.map((s, i) => {
                        const pct = pcts[i];
                        const tally = tallyFor(s, row);
                        const isLow = min != null && pct === min && spread != null && spread >= 10;
                        return (
                          <td key={s.course.course_id} className="px-2 py-1.5 text-center">
                            {pct == null ? (
                              <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                            ) : (
                              <span
                                className={`inline-flex min-w-[3rem] items-center justify-center rounded-md px-2.5 py-1.5 text-xs tabular-nums ${
                                  isHeader ? "font-bold" : "font-semibold"
                                } ${isLow ? "ring-2 ring-rose-400 ring-offset-1 dark:ring-offset-slate-900" : ""}`}
                                style={{ backgroundColor: band(pct).bg, color: band(pct).fg }}
                                title={tally ? `${tally.c} of ${tally.t} answers correct (${pct}%)` : undefined}
                              >
                                {pct}%
                                {isLow && <span className="sr-only"> (weakest class)</span>}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
