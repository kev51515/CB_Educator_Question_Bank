/**
 * TestMonitorModal
 * ================
 * Live proctoring view for a full-length test — which student is on which
 * question, how far they are, time left, and who's gone idle. Polls
 * test_live_progress every few seconds (no websockets needed for a class).
 *
 * Opened from the Full-Test catalog ("Monitor"). Auto-refreshes; pauses polling
 * while the tab is hidden.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useEscapeKey, useFocusTrap } from "../hooks";
import { SkeletonRows } from "../components/Skeleton";

interface LiveRow {
  student_id: string;
  student_name: string | null;
  state: "submitted" | "in_progress" | "not_started";
  module_position: number | null;
  module_label: string | null;
  current_question: number | null;
  answered: number | null;
  module_questions: number | null;
  seconds_remaining: number | null;
  marked: number | null;
  last_seen_at: string | null;
  submitted_at: string | null;
}

interface TestMonitorModalProps {
  slug: string;
  title: string;
  onClose: () => void;
}

const POLL_MS = 4000;
const IDLE_MS = 40_000; // no heartbeat for this long → flag as idle

function fmtClock(sec: number | null): string {
  if (sec == null) return "—";
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function secsAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((Date.now() - t) / 1000);
}

export function TestMonitorModal({ slug, title, onClose }: TestMonitorModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  useEscapeKey(onClose);

  const [rows, setRows] = useState<LiveRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // forces idle-time recompute between polls

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const { data, error: rpcError } = await supabase.rpc("test_live_progress", {
        p_slug: slug,
      });
      if (rpcError) setError(rpcError.message);
      else {
        setError(null);
        setRows((data ?? []) as LiveRow[]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoaded(true);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    // 1s clock tick so "idle Ns" / time-left recompute smoothly between polls.
    const clock = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  const taking = rows.filter((r) => r.state === "in_progress").length;
  const done = rows.filter((r) => r.state === "submitted").length;
  const notStarted = rows.filter((r) => r.state === "not_started").length;
  void tick; // referenced so the 1s tick re-renders idle/time computations

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — live monitor`}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                Live monitor — {title}
              </h2>
            </div>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {taking} taking · {done} done · {notStarted} not started
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        {!loaded ? (
          <SkeletonRows count={4} rowClassName="h-12" />
        ) : error ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No students are assigned this test yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
            {rows.map((r) => {
              const idleFor = r.state === "in_progress" ? secsAgo(r.last_seen_at) : null;
              const idle = idleFor != null && idleFor * 1000 > IDLE_MS;
              const lowTime = (r.seconds_remaining ?? 999) < 120;
              return (
                <li
                  key={r.student_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 bg-white dark:bg-slate-900"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {r.student_name ?? "Student"}
                  </span>

                  {r.state === "in_progress" ? (
                    <>
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900">
                        {r.module_label
                          ? `M${r.module_position}`
                          : `Module ${r.module_position}`}{" "}
                        · Q{r.current_question ?? "?"}
                      </span>
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {r.answered ?? 0}/{r.module_questions ?? "?"} answered
                        {(r.marked ?? 0) > 0 ? ` · ${r.marked}🔖` : ""}
                      </span>
                      <span
                        className={`text-xs tabular-nums font-medium ${lowTime ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300"}`}
                      >
                        ⏱ {fmtClock(r.seconds_remaining)}
                      </span>
                      {idle && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                          idle {idleFor}s
                        </span>
                      )}
                    </>
                  ) : r.state === "submitted" ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
                      Submitted
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      Not started
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          Auto-refreshing every {POLL_MS / 1000}s.
        </p>
      </div>
    </div>
  );
}
