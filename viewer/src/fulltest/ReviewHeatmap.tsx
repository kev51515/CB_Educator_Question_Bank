/**
 * ReviewHeatmap (staff Review Mode)
 * =================================
 * A whole-test, at-a-glance overlay for the teacher: every question across
 * every module laid out as a grid, each cell shaded by the class's percent-
 * correct (red = hardest → green = easiest). Lets a teacher spot the questions
 * a class struggled with without paging through one at a time. Click any cell
 * to jump straight to that question (and close).
 *
 * Near-fullscreen so a long test breathes. A summary band surfaces the overall
 * class average + the "most missed" questions as quick-jump chips; each module
 * is its own card with an average pill. Difficulty is encoded by BOTH colour and
 * the printed % (never colour alone), and each cell's title spells out the exact
 * count. Modal contract per CLAUDE.md: role="dialog", focus trap, Esc + backdrop
 * close, ≥40px close target.
 */
import { useMemo, useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { TestContentModule } from "./testContent";

export interface QStat {
  total: number;
  correct: number;
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
}

interface Cell {
  mIdx: number;
  qIdx: number;
  number: number;
  label: string;
  pct: number | null;
  st: QStat | null;
}

/**
 * The app's standard 3-band performance palette (matches the Review sidebar
 * bars): emerald ≥70%, amber ≥40%, rose below. Text colour per band is picked
 * for legibility on the fill — dark on amber, white on green/red.
 */
const BANDS = {
  good: { bg: "#10b981", fg: "#ffffff" }, // emerald-500
  mid: { bg: "#f59e0b", fg: "#1f2937" }, // amber-500 + slate-800 text
  bad: { bg: "#f43f5e", fg: "#ffffff" }, // rose-500
} as const;
type Band = (typeof BANDS)[keyof typeof BANDS];

function band(pct: number): Band {
  return pct >= 70 ? BANDS.good : pct >= 40 ? BANDS.mid : BANDS.bad;
}

const LEGEND_GRADIENT = `linear-gradient(to right, ${BANDS.bad.bg}, ${BANDS.mid.bg}, ${BANDS.good.bg})`;

export function ReviewHeatmap({
  modules,
  statOf,
  mi,
  qi,
  onJump,
  onClose,
  courseTitle,
  taken,
}: Props): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  // Flatten every question with its module coordinates + class stat.
  const cells = useMemo<Cell[][]>(
    () =>
      modules.map((m, mIdx) =>
        m.questions.map((q, qIdx) => {
          const st = statOf(q.id);
          const pct = st && st.total ? Math.round((st.correct / st.total) * 100) : null;
          return { mIdx, qIdx, number: q.number, label: m.label, pct, st };
        }),
      ),
    [modules, statOf],
  );

  const moduleAvg = useMemo(
    () =>
      cells.map((row) => {
        let total = 0;
        let correct = 0;
        for (const c of row)
          if (c.st && c.st.total) {
            total += c.st.total;
            correct += c.st.correct;
          }
        return total ? Math.round((correct / total) * 100) : null;
      }),
    [cells],
  );

  const flat = useMemo(() => cells.flat(), [cells]);
  const overall = useMemo(() => {
    let total = 0;
    let correct = 0;
    for (const c of flat)
      if (c.st && c.st.total) {
        total += c.st.total;
        correct += c.st.correct;
      }
    return total ? Math.round((correct / total) * 100) : null;
  }, [flat]);

  // Hardest few questions (lowest %-correct) → quick-jump chips.
  const mostMissed = useMemo(
    () =>
      flat
        .filter((c) => c.pct != null)
        .sort((a, b) => (a.pct! - b.pct!) || a.number - b.number)
        .slice(0, 5),
    [flat],
  );

  const anyData = overall != null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
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

            <button
              type="button"
              data-autofocus
              onClick={onClose}
              aria-label="Close heatmap"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {anyData && (
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              {/* most-missed quick jumps */}
              {mostMissed.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Most missed
                  </span>
                  {mostMissed.map((c) => (
                    <button
                      key={`${c.mIdx}-${c.qIdx}`}
                      type="button"
                      onClick={() => {
                        onJump(c.mIdx, c.qIdx);
                        onClose();
                      }}
                      title={`${c.label} · Q${c.number} · ${c.st!.correct}/${c.st!.total} correct (${c.pct}%)`}
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

              {/* legend */}
              <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Hardest</span>
                <span
                  aria-hidden
                  className="h-2 w-32 rounded-full"
                  style={{ background: LEGEND_GRADIENT }}
                />
                <span>Easiest</span>
                <span className="ml-2 inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="h-3 w-3 rounded-sm bg-slate-200 ring-1 ring-inset ring-slate-300 dark:bg-slate-700 dark:ring-slate-600"
                  />
                  No data
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ---- scrollable body ---- */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {!anyData ? (
            <div className="grid h-full place-items-center">
              <p className="max-w-sm rounded-xl bg-slate-50 px-6 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-slate-800">
                No responses yet — the heatmap fills in once students submit this test.
              </p>
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
                      {cells[mIdx].map((c) => {
                        const isCurrent = c.mIdx === mi && c.qIdx === qi;
                        const b = c.pct != null ? band(c.pct) : null;
                        return (
                          <button
                            key={`${c.mIdx}-${c.qIdx}`}
                            type="button"
                            onClick={() => {
                              onJump(c.mIdx, c.qIdx);
                              onClose();
                            }}
                            title={
                              c.st
                                ? `Q${c.number} · ${c.st.correct}/${c.st.total} correct (${c.pct}%)`
                                : `Q${c.number} · no responses`
                            }
                            style={b ? { backgroundColor: b.bg, color: b.fg } : undefined}
                            className={`group grid aspect-square place-items-center rounded-lg text-center leading-none shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                              b == null
                                ? "bg-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700"
                                : ""
                            } ${isCurrent ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900" : ""}`}
                          >
                            <span className="text-sm font-bold tabular-nums">{c.number}</span>
                            <span className="mt-0.5 text-[10px] font-medium tabular-nums opacity-90">
                              {c.pct != null ? `${c.pct}%` : "—"}
                            </span>
                          </button>
                        );
                      })}
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
