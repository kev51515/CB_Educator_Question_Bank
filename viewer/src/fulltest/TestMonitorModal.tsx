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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useEscapeKey, useFocusTrap } from "@/hooks";
import { useToast } from "@/components/Toast";
import { SkeletonRows } from "@/components/Skeleton";
import { getRunTimeline } from "./api";
import type { ProctorEvent } from "./api";
import ProctorTimeline from "./ProctorTimeline";
import { flagLabel } from "./test-overview/helpers";

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
  away_count: number | null;
  paused: boolean | null;
  integrity: Record<string, number> | null;
  last_seen_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  run_id: string | null;
  // Proctoring roll-up (migration 0108). Nullable for runs that predate it.
  away_total_seconds: number | null;
  focus_loss_count: number | null;
  focus_loss_seconds: number | null;
  flagged: boolean | null;
  flag_reasons: string[] | null;
}

function fmtIntegrity(i: Record<string, number> | null | undefined): string | null {
  if (!i) return null;
  const parts = [
    (i.paste ?? 0) > 0 && `paste ${i.paste}×`,
    (i.copy ?? 0) > 0 && `copy ${i.copy}×`,
    (i.fullscreen_exit ?? 0) > 0 && `left FS ${i.fullscreen_exit}×`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

interface TestMonitorModalProps {
  slug: string;
  title: string;
  /** Only the lead teacher (admin) may act on a live sitting; others are read-only. */
  isAdmin?: boolean;
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

/** "0:42" / "3:05" from a second count — compact away-time badge. */
function fmtAwaySecs(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Wall-clock time of day (e.g. "1:42 PM") — what a proctor wants for start/submit. */
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function TestMonitorModal({ slug, title, isAdmin = false, onClose }: TestMonitorModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  useEscapeKey(onClose);
  const toast = useToast();

  const [rows, setRows] = useState<LiveRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // forces idle-time recompute between polls
  const [busyRun, setBusyRun] = useState<string | null>(null);
  // Per-student row expansion → full proctoring timeline (lazy-loaded by run_id).
  const [expanded, setExpanded] = useState<string | null>(null); // student_id
  const [timelines, setTimelines] = useState<Record<string, ProctorEvent[]>>({}); // by run_id
  const [timelineLoading, setTimelineLoading] = useState<string | null>(null); // run_id

  // Toggle a row open/closed; lazy-fetch its timeline the first time it opens.
  // Side-effects live outside the state updater so StrictMode's double-invoke
  // of the updater can't double-fire the fetch.
  const toggleExpand = useCallback(
    (studentId: string, runId: string | null): void => {
      const willOpen = expanded !== studentId;
      setExpanded(willOpen ? studentId : null);
      if (willOpen && runId && !(runId in timelines)) {
        setTimelineLoading(runId);
        void getRunTimeline(runId)
          .then((events) => setTimelines((m) => ({ ...m, [runId]: events })))
          .finally(() => setTimelineLoading((c) => (c === runId ? null : c)));
      }
    },
    [expanded, timelines],
  );

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

  const addTime = useCallback(
    async (runId: string | null, seconds: number, who: string): Promise<void> => {
      if (!runId) return;
      setBusyRun(runId);
      try {
        const { error: rpcError } = await supabase.rpc("proctor_add_time", {
          p_run_id: runId,
          p_seconds: seconds,
        });
        if (rpcError) toast.error("Couldn't add time", rpcError.message);
        else {
          toast.success(`+${Math.round(seconds / 60)} min for ${who}`);
          void refresh();
        }
      } finally {
        setBusyRun(null);
      }
    },
    [toast, refresh],
  );

  const setPause = useCallback(
    async (runId: string | null, pause: boolean, who: string): Promise<void> => {
      if (!runId) return;
      setBusyRun(runId);
      try {
        const { error: rpcError } = await supabase.rpc("proctor_set_pause", {
          p_run_id: runId,
          p_paused: pause,
        });
        if (rpcError) toast.error(pause ? "Couldn't pause" : "Couldn't resume", rpcError.message);
        else {
          toast.success(pause ? `Paused ${who}` : `Resumed ${who}`);
          void refresh();
        }
      } finally {
        setBusyRun(null);
      }
    },
    [toast, refresh],
  );

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

  // Triage: bubble in-progress students who need attention (left the tab, idle,
  // or low on time) to the top. `tick` is in the deps so idle/low-time recompute
  // each second between polls.
  const { sorted, flagged } = useMemo(() => {
    void tick;
    // Higher score = needs the proctor's eyes sooner. The server's `flagged`
    // bit dominates; raw signals (away count + total away time + full-screen
    // exits + idle + low time) layer on so the ordering stays meaningful even
    // before a hard flag trips. Only live sittings score.
    const attention = (r: LiveRow): number => {
      if (r.state !== "in_progress") return 0;
      let s = 0;
      if (r.flagged) s += 1000; // server-decided flag → top of the list
      if ((r.away_count ?? 0) > 0) s += 100 + (r.away_count ?? 0);
      // Weight cumulative away time: +1 per 10s away, capped so one long
      // absence doesn't drown out everything else.
      s += Math.min(80, Math.floor((r.away_total_seconds ?? 0) / 10));
      const fsExits = r.integrity?.fullscreen_exit ?? 0;
      if (fsExits > 0) s += 40 + fsExits * 5;
      if ((r.focus_loss_count ?? 0) > 0) s += 15 + (r.focus_loss_count ?? 0);
      const idleFor = secsAgo(r.last_seen_at);
      if (idleFor != null && idleFor * 1000 > IDLE_MS) s += 50;
      if ((r.seconds_remaining ?? 99999) < 120) s += 30;
      return s;
    };
    const rank = (st: LiveRow["state"]) =>
      st === "in_progress" ? 0 : st === "submitted" ? 1 : 2;
    const next = [...rows].sort((a, b) => {
      const r = rank(a.state) - rank(b.state);
      if (r !== 0) return r;
      const at = attention(b) - attention(a);
      if (at !== 0) return at;
      return (a.student_name ?? "").localeCompare(b.student_name ?? "");
    });
    return { sorted: next, flagged: rows.filter((r) => attention(r) > 0).length };
  }, [rows, tick]);

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
              {flagged > 0 && (
                <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
                  · ⚠ {flagged} need{flagged === 1 ? "s" : ""} attention
                </span>
              )}
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
            {sorted.map((r) => {
              const idleFor = r.state === "in_progress" ? secsAgo(r.last_seen_at) : null;
              const idle = idleFor != null && idleFor * 1000 > IDLE_MS;
              const lowTime = (r.seconds_remaining ?? 999) < 120;
              const away = r.away_count ?? 0;
              const awaySecs = r.away_total_seconds ?? 0;
              const flaggedRow = r.flagged === true;
              const flagReasons = r.flag_reasons ?? [];
              // Expandable only when there's a run to pull a timeline for.
              const canExpand = !!r.run_id && r.state !== "not_started";
              const isOpen = expanded === r.student_id;
              const panelId = `proctor-panel-${r.student_id}`;
              return (
                <li key={r.student_id} className="bg-white dark:bg-slate-900">
                  <div
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 ${
                      flaggedRow ? "bg-rose-50/60 dark:bg-rose-950/20" : ""
                    }`}
                  >
                    {canExpand ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => toggleExpand(r.student_id, r.run_id)}
                        title={isOpen ? "Hide proctoring timeline" : "Show proctoring timeline"}
                        className="-ml-1 flex h-7 w-7 flex-none items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      >
                        <span
                          aria-hidden
                          className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}
                        >
                          ▸
                        </span>
                      </button>
                    ) : (
                      <span className="-ml-1 h-7 w-7 flex-none" aria-hidden />
                    )}
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
                      {r.started_at && (
                        <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                          started {fmtTime(r.started_at)}
                        </span>
                      )}
                      {idle && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                          idle {idleFor}s
                        </span>
                      )}
                      {flaggedRow && (
                        <span
                          title={
                            flagReasons.length
                              ? flagReasons.map(flagLabel).join(" · ")
                              : "Flagged for review"
                          }
                          className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800"
                        >
                          ⚑ Needs review
                        </span>
                      )}
                      {away > 0 && (
                        <span
                          title="Times the student left the test tab (total time away)"
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900"
                        >
                          ↗ left tab {away}×{awaySecs > 0 ? ` · ${fmtAwaySecs(awaySecs)}` : ""}
                        </span>
                      )}
                      {fmtIntegrity(r.integrity) && (
                        <span
                          title="Integrity signals"
                          className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
                        >
                          ⚑ {fmtIntegrity(r.integrity)}
                        </span>
                      )}
                      {r.paused && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900">
                          ⏸ paused
                        </span>
                      )}
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            disabled={busyRun === r.run_id}
                            onClick={() =>
                              void setPause(r.run_id, !r.paused, r.student_name ?? "student")
                            }
                            title={r.paused ? "Resume this student's timer" : "Freeze this student's timer"}
                            className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          >
                            {busyRun === r.run_id ? "…" : r.paused ? "Resume" : "Pause"}
                          </button>
                          <button
                            type="button"
                            disabled={busyRun === r.run_id}
                            onClick={() => void addTime(r.run_id, 300, r.student_name ?? "student")}
                            title="Give this student 5 more minutes on the current section"
                            className="rounded-md px-2 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          >
                            {busyRun === r.run_id ? "…" : "+5 min"}
                          </button>
                        </>
                      )}
                    </>
                  ) : r.state === "submitted" ? (
                    <>
                      {flaggedRow && (
                        <span
                          title={
                            flagReasons.length
                              ? flagReasons.map(flagLabel).join(" · ")
                              : "Flagged for review"
                          }
                          className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800"
                        >
                          ⚑ Needs review
                        </span>
                      )}
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
                        Submitted {fmtTime(r.submitted_at)}
                      </span>
                    </>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      Not started
                    </span>
                  )}
                  </div>

                  {/* Expanded: full proctoring timeline for this run (lazy). */}
                  {isOpen && canExpand && (
                    <div
                      id={panelId}
                      className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 px-4 py-3"
                    >
                      <ProctorTimeline
                        events={r.run_id ? (timelines[r.run_id] ?? []) : []}
                        startedAt={r.started_at}
                        submittedAt={r.submitted_at}
                        loading={!!r.run_id && timelineLoading === r.run_id && !(r.run_id in timelines)}
                      />
                    </div>
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
