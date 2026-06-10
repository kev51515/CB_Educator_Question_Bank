/**
 * ReviewHeatmap (staff Review Mode)
 * =================================
 * A whole-test, at-a-glance overlay for the teacher. Two views:
 *
 *   • By question — every question across every module as a grid cell, shaded
 *     by the class's percent-correct (red = hardest → green = easiest).
 *   • By skill — the same results rolled up into College Board's official SAT
 *     domains (Algebra, Craft & Structure, …) so "Q13 was hard" becomes "this
 *     class is weak in Advanced Math". Surfaces the weakest domain up top.
 *
 * Click any cell (either view) to jump straight to that question and close.
 *
 * The summary band surfaces overall %, a mastered/shaky/struggled triage bar,
 * and the genuinely-missed questions as quick-jump chips. For a missed question
 * the tooltip + aria-label name the distractor the class fell for ("most chose
 * B"). Difficulty is encoded by BOTH colour and printed % (never colour alone);
 * cells carry an aria-label with the exact count. Modal contract per CLAUDE.md:
 * role="dialog", focus trap, Esc + backdrop close, ≥40px close target. Arrow
 * keys are swallowed so they don't leak to the nav behind the modal.
 */
import { useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { downloadCsv } from "@/lib/csv";
import { PacingHeatmapTab } from "./PacingHeatmapTab";
import type { PacingQuestionRef } from "./PacingChart";
import { band, BANDS, isChoiceLetter, LEGEND_GRADIENT, orderDomains, orderSections, sectionLabel } from "./skills";
import type { TestContentModule } from "./testContent";

export interface QStat {
  total: number;
  correct: number;
  /** most-common incorrect answer (letter for mcq, typed value for grid) */
  topWrong?: { value: string; count: number } | null;
}

interface Props {
  modules: TestContentModule[];
  /** class %-correct source, keyed by question id (null = no responses) */
  statOf: (qid: string) => QStat | null;
  mi: number;
  qi: number;
  onJump: (moduleIndex: number, questionIndex: number) => void;
  onClose: () => void;
  courseTitle?: string | null;
  taken?: number;
  /** test slug, for the CSV filename + the pacing roster fetch */
  slug?: string;
  /** selected course (null = all classes) — scopes the pacing roster */
  courseId?: string | null;
  /** module range scoping (Module-1-only review, etc.) for the pacing roster */
  moduleRange?: { first: number; last: number } | null;
}

interface Cell {
  mIdx: number;
  qIdx: number;
  number: number;
  label: string;
  section: string;
  domain: string | null;
  pct: number | null;
  st: QStat | null;
}

// Remember the teacher's By-skill / By-question preference across opens.
const VIEW_KEY = "fulltest:review:heatmapView";

/** "3/8 correct (38%) · most chose B" — shared by tooltip + aria-label. The
 *  distractor hint is shown only for MCQ letters (a typed grid value like "1.5"
 *  reads ambiguously as "most chose 1.5"). */
function describe(c: Cell): string {
  if (!c.st) return `Q${c.number}: no responses`;
  let s = `Q${c.number}: ${c.st.correct} of ${c.st.total} correct (${c.pct}%)`;
  if (c.pct! < 100 && c.st.topWrong && isChoiceLetter(c.st.topWrong.value)) {
    s += ` · most chose ${c.st.topWrong.value}`;
  }
  return s;
}

export function ReviewHeatmap({
  modules,
  statOf,
  mi,
  qi,
  onJump,
  onClose,
  courseTitle,
  taken,
  slug,
  courseId,
  moduleRange,
}: Props): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  // Ordered question refs for the pacing chart (test order, with module labels).
  const pacingQuestions = useMemo<PacingQuestionRef[]>(
    () =>
      modules.flatMap((m) =>
        m.questions.map((q) => ({
          id: q.id,
          number: q.number,
          module: m.position,
          moduleLabel: m.label,
        })),
      ),
    [modules],
  );
  const pacingAvailable = !!slug && pacingQuestions.length > 0;

  const jump = (c: Cell) => {
    onJump(c.mIdx, c.qIdx);
    onClose();
  };

  const exportCsv = () => {
    const header = ["Module", "Question", "Domain", "% correct", "Correct", "Total"];
    const body = flat.map((c) => [
      c.label,
      c.number,
      c.domain ?? "",
      c.pct ?? "",
      c.st?.correct ?? "",
      c.st?.total ?? "",
    ]);
    downloadCsv(`heatmap-${slug ?? "results"}.csv`, [header, ...body]);
  };

  // Flatten every question with its module coordinates + class stat.
  const cells = useMemo<Cell[][]>(
    () =>
      modules.map((m, mIdx) =>
        m.questions.map((q, qIdx) => {
          const st = statOf(q.id);
          const pct = st && st.total ? Math.round((st.correct / st.total) * 100) : null;
          return { mIdx, qIdx, number: q.number, label: m.label, section: m.section, domain: q.domain, pct, st };
        }),
      ),
    [modules, statOf],
  );
  const flat = useMemo(() => cells.flat(), [cells]);

  const moduleAvg = useMemo(() => cells.map((row) => aggregate(row)), [cells]);
  const overall = useMemo(() => aggregate(flat), [flat]);

  const dist = useMemo(() => {
    let good = 0, mid = 0, bad = 0;
    for (const c of flat) {
      if (c.pct == null) continue;
      if (c.pct >= 70) good++;
      else if (c.pct >= 40) mid++;
      else bad++;
    }
    return { good, mid, bad, scored: good + mid + bad };
  }, [flat]);

  const mostMissed = useMemo(
    () =>
      flat
        .filter((c) => c.pct != null && c.pct < 70)
        .sort((a, b) => a.pct! - b.pct! || a.number - b.number)
        .slice(0, 6),
    [flat],
  );

  // Roll questions up into SAT domains, grouped by section, weakest-domain first.
  const skill = useMemo(() => {
    const bySection = new Map<string, Map<string, Cell[]>>();
    for (const c of flat) {
      if (!c.domain) continue;
      if (!bySection.has(c.section)) bySection.set(c.section, new Map());
      const dm = bySection.get(c.section)!;
      (dm.get(c.domain) ?? dm.set(c.domain, []).get(c.domain)!).push(c);
    }
    return orderSections(bySection.keys()).map((sec) => {
      const dm = bySection.get(sec)!;
      return {
        section: sec,
        domains: orderDomains(sec, dm.keys()).map((d) => {
          const qs = dm.get(d)!.slice().sort((a, b) => a.number - b.number);
          return { domain: d, pct: aggregate(qs), cells: qs };
        }),
      };
    });
  }, [flat]);

  const hasDomains = useMemo(() => flat.some((c) => c.domain), [flat]);
  const weakest = useMemo(() => {
    let w: { domain: string; pct: number } | null = null;
    for (const s of skill)
      for (const d of s.domains)
        if (d.pct != null && (!w || d.pct < w.pct)) w = { domain: d.domain, pct: d.pct };
    return w;
  }, [skill]);

  const [view, setViewState] = useState<"question" | "skill" | "pacing">(() => {
    if (!hasDomains) return "question";
    try {
      return window.localStorage.getItem(VIEW_KEY) === "question" ? "question" : "skill";
    } catch {
      return "skill";
    }
  });
  const setView = (v: "question" | "skill" | "pacing") => {
    setViewState(v);
    // Pacing is a transient pivot — don't persist it as the default grouping.
    if (v === "pacing") return;
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore (private mode / quota) */
    }
  };
  const anyData = overall != null;

  // Tabs: the correctness groupings (By skill / By question) plus Pacing when a
  // roster is fetchable. Pacing can show even before any answers are graded.
  const tabs = useMemo<Array<{ key: "skill" | "question" | "pacing"; label: string }>>(() => {
    const t: Array<{ key: "skill" | "question" | "pacing"; label: string }> = [];
    if (hasDomains && anyData) {
      t.push({ key: "skill", label: "By skill" });
      t.push({ key: "question", label: "By question" });
    } else if (anyData) {
      t.push({ key: "question", label: "By question" });
    }
    if (pacingAvailable) t.push({ key: "pacing", label: "Pacing" });
    return t;
  }, [hasDomains, anyData, pacingAvailable]);
  // Fall back to the first available tab if the persisted view isn't offered
  // (e.g. a no-responses-yet test where only Pacing is reachable).
  const effView = tabs.some((t) => t.key === view) ? view : tabs[0]?.key ?? view;

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
        aria-labelledby="heatmap-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[calc(100vh-1.5rem)] w-full max-w-[88rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:max-h-[calc(100vh-3rem)]"
      >
        {/* ---- sticky header ---- */}
        <div className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="min-w-0">
                <h2 id="heatmap-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Class heatmap
                </h2>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {courseTitle
                    ? `${courseTitle}${taken != null ? ` · ${taken} submitted` : ""}`
                    : "How the class answered, by question"}
                </p>
              </div>
              {overall != null && (
                <div
                  className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 shadow-sm"
                  style={{ backgroundColor: band(overall).bg, color: band(overall).fg }}
                  title={`Overall ${overall}% correct across the test`}
                >
                  <span className="text-2xl font-bold leading-none tabular-nums">{overall}%</span>
                  <span className="text-[10px] font-medium uppercase leading-tight opacity-90">
                    overall
                    <br />
                    correct
                  </span>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {tabs.length > 1 && (
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium dark:bg-slate-800" role="tablist" aria-label="Heatmap grouping">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={effView === t.key}
                      onClick={() => setView(t.key)}
                      className={`rounded-md px-3 py-1 transition-colors ${
                        effView === t.key
                          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              {anyData && (
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
                aria-label="Close heatmap"
                className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {anyData && (
            <div className="mt-3.5 flex flex-wrap items-center gap-x-6 gap-y-3">
              {dist.scored > 0 && (
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-2.5 w-44 overflow-hidden rounded-full"
                    role="img"
                    aria-label={`${dist.good} mastered, ${dist.mid} shaky, ${dist.bad} struggled`}
                  >
                    {dist.bad > 0 && <span style={{ width: `${(dist.bad / dist.scored) * 100}%`, backgroundColor: BANDS.bad.bg }} />}
                    {dist.mid > 0 && <span style={{ width: `${(dist.mid / dist.scored) * 100}%`, backgroundColor: BANDS.mid.bg }} />}
                    {dist.good > 0 && <span style={{ width: `${(dist.good / dist.scored) * 100}%`, backgroundColor: BANDS.good.bg }} />}
                  </span>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <Tally color={BANDS.good.bg} n={dist.good} label="mastered" />
                    <Tally color={BANDS.mid.bg} n={dist.mid} label="shaky" />
                    <Tally color={BANDS.bad.bg} n={dist.bad} label="struggled" />
                  </div>
                </div>
              )}

              <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Hardest</span>
                <span aria-hidden className="h-2 w-28 rounded-full" style={{ background: LEGEND_GRADIENT }} />
                <span>Easiest</span>
                <span className="ml-2 inline-flex items-center gap-1">
                  <span aria-hidden className="h-3 w-3 rounded-sm bg-slate-200 ring-1 ring-inset ring-slate-300 dark:bg-slate-700 dark:ring-slate-600" />
                  No data
                </span>
              </div>

              {mostMissed.length > 0 && (
                <div className="flex w-full flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Most missed
                  </span>
                  {mostMissed.map((c) => (
                    <button
                      key={`${c.mIdx}-${c.qIdx}`}
                      type="button"
                      onClick={() => jump(c)}
                      aria-label={`Go to ${describe(c)}`}
                      title={`${c.label} · ${describe(c)}`}
                      className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-1.5 pr-2.5 text-[11px] font-semibold shadow-sm transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900"
                      style={{ backgroundColor: band(c.pct!).bg, color: band(c.pct!).fg }}
                    >
                      <span className="grid h-4 min-w-4 place-items-center rounded-full bg-black/15 px-1 text-[10px] tabular-nums">
                        {c.number}
                      </span>
                      {c.pct}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- scrollable body ---- */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {effView === "pacing" ? (
            <PacingHeatmapTab
              slug={slug ?? ""}
              courseId={courseId ?? null}
              moduleRange={moduleRange ?? null}
              questions={pacingQuestions}
            />
          ) : !anyData ? (
            <div className="grid h-full place-items-center">
              <p className="max-w-sm rounded-xl bg-slate-50 px-6 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-slate-800">
                No responses yet — the heatmap fills in once students submit this test.
              </p>
            </div>
          ) : effView === "skill" ? (
            <div className="space-y-5">
              {weakest && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Weakest skill:{" "}
                  <span
                    className="rounded-md px-1.5 py-0.5 font-semibold"
                    style={{ backgroundColor: band(weakest.pct).bg, color: band(weakest.pct).fg }}
                  >
                    {weakest.domain} · {weakest.pct}%
                  </span>
                </p>
              )}
              {skill.map((s) => (
                <section
                  key={s.section}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    {sectionLabel(s.section)}
                  </h3>
                  <div className="space-y-4">
                    {s.domains.map((d) => (
                      <div key={d.domain}>
                        <div className="mb-1.5 flex items-center gap-3">
                          <span className="w-56 shrink-0 text-sm font-medium text-slate-700 dark:text-slate-200">
                            {d.domain}
                          </span>
                          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            {d.pct != null && (
                              <span className="block h-full rounded-full" style={{ width: `${d.pct}%`, backgroundColor: band(d.pct).bg }} />
                            )}
                          </span>
                          <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                            {d.pct != null ? `${d.pct}%` : "—"} · {d.cells.length}q
                          </span>
                        </div>
                        <div className="ml-0 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2 sm:ml-[15rem]">
                          {d.cells.map((c) => (
                            <QCell key={`${c.mIdx}-${c.qIdx}`} c={c} current={c.mIdx === mi && c.qIdx === qi} onJump={jump} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {modules.map((m, mIdx) => {
                const avg = moduleAvg[mIdx];
                return (
                  <section
                    key={m.position}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        {m.label}
                        <span className="ml-2 font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
                          {m.questions.length} questions
                        </span>
                      </h3>
                      {avg != null && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm"
                          style={{ backgroundColor: band(avg).bg, color: band(avg).fg }}
                          title={`Module average ${avg}% correct`}
                        >
                          avg {avg}%
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2">
                      {cells[mIdx].map((c) => (
                        <QCell key={`${c.mIdx}-${c.qIdx}`} c={c} current={c.mIdx === mi && c.qIdx === qi} onJump={jump} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** sum(correct)/sum(total) → rounded %, or null when nothing answered. */
function aggregate(cells: Cell[]): number | null {
  let total = 0, correct = 0;
  for (const c of cells)
    if (c.st && c.st.total) {
      total += c.st.total;
      correct += c.st.correct;
    }
  return total ? Math.round((correct / total) * 100) : null;
}

function QCell({ c, current, onJump }: { c: Cell; current: boolean; onJump: (c: Cell) => void }): JSX.Element {
  const b = c.pct != null ? band(c.pct) : null;
  return (
    <button
      type="button"
      onClick={() => onJump(c)}
      aria-label={`Go to ${describe(c)}`}
      aria-current={current ? "true" : undefined}
      title={describe(c)}
      style={b ? { backgroundColor: b.bg, color: b.fg } : undefined}
      className={`grid aspect-square place-items-center rounded-lg text-center leading-none shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
        b == null
          ? "bg-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700"
          : ""
      } ${current ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900" : ""}`}
    >
      <span className="text-sm font-bold tabular-nums">{c.number}</span>
      <span className="mt-0.5 text-[10px] font-medium tabular-nums opacity-90">{c.pct != null ? `${c.pct}%` : "—"}</span>
    </button>
  );
}

function Tally({ color, n, label }: { color: string; n: number; label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">{n}</span>
      {label}
    </span>
  );
}
