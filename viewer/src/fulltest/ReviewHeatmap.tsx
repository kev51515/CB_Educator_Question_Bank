/**
 * ReviewHeatmap (staff Review Mode)
 * =================================
 * A whole-test, at-a-glance overlay for the teacher: every question across
 * every module laid out as a grid, each cell shaded by the class's percent-
 * correct (red = hardest → green = easiest). Lets a teacher spot the questions
 * a class struggled with without paging through one at a time. Click any cell
 * to jump straight to that question (and close).
 *
 * Difficulty is encoded by BOTH colour and the printed % (never colour alone),
 * and each cell's title spells out the exact count for screen-reader / hover.
 * Modal contract per CLAUDE.md: role="dialog", focus trap, Esc + backdrop
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

/** Continuous red→amber→green shade for a 0–1 correctness ratio. */
function shade(ratio: number): string {
  const hue = Math.round(ratio * 132); // 0 = red, 132 = green
  return `hsl(${hue}, 64%, 42%)`;
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
}: Props): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  // Per-module average %-correct (over questions that have any responses).
  const moduleAvg = useMemo(
    () =>
      modules.map((m) => {
        let total = 0;
        let correct = 0;
        for (const q of m.questions) {
          const st = statOf(q.id);
          if (st && st.total) {
            total += st.total;
            correct += st.correct;
          }
        }
        return total ? Math.round((correct / total) * 100) : null;
      }),
    [modules, statOf],
  );

  const anyData = moduleAvg.some((a) => a != null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8"
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
        className="my-auto w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="heatmap-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Class heatmap
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {courseTitle
                ? `${courseTitle}${taken != null ? ` · ${taken} submitted` : ""}`
                : "How the class answered, by question"}
            </p>
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

        {!anyData ? (
          <p className="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-slate-800">
            No responses yet — the heatmap fills in once students submit this test.
          </p>
        ) : (
          <>
            {/* legend */}
            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Hardest</span>
              <span
                aria-hidden
                className="h-2 w-28 rounded-full"
                style={{
                  background: `linear-gradient(to right, ${shade(0)}, ${shade(0.5)}, ${shade(1)})`,
                }}
              />
              <span>Easiest</span>
              <span className="ml-3 inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-sm bg-slate-200 ring-1 ring-inset ring-slate-300 dark:bg-slate-700 dark:ring-slate-600"
                />
                No data
              </span>
            </div>

            {/* per-module grids */}
            <div className="mt-4 space-y-4">
              {modules.map((m, mIdx) => {
                const avg = moduleAvg[mIdx];
                return (
                  <section key={m.position}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {m.label}
                      </h3>
                      {avg != null && (
                        <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                          avg {avg}%
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.questions.map((q, qIdx) => {
                        const st = statOf(q.id);
                        const pct = st && st.total ? Math.round((st.correct / st.total) * 100) : null;
                        const isCurrent = mIdx === mi && qIdx === qi;
                        const bg = pct != null ? shade(pct / 100) : undefined;
                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => {
                              onJump(mIdx, qIdx);
                              onClose();
                            }}
                            title={
                              st
                                ? `Q${q.number} · ${st.correct}/${st.total} correct (${pct}%)`
                                : `Q${q.number} · no responses`
                            }
                            style={bg ? { backgroundColor: bg } : undefined}
                            className={`grid h-10 w-10 place-items-center rounded-md text-[11px] font-semibold leading-none tabular-nums transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 ${
                              pct != null
                                ? "text-white"
                                : "bg-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700"
                            } ${isCurrent ? "ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900" : ""}`}
                          >
                            <span>{q.number}</span>
                            <span className="text-[9px] font-medium opacity-90">
                              {pct != null ? `${pct}%` : "—"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
