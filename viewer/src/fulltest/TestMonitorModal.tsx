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
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { ResponsiveModal } from "@/components/ResponsiveModal";
import { SkeletonRows } from "@/components/Skeleton";
import { getRunTimeline } from "./api";
import type { ProctorEvent } from "./api";
import ProctorTimeline from "./ProctorTimeline";
import { flagLabel } from "./test-overview/helpers";
import { StatusPill, RowAction, ActionGroup } from "./test-overview";
import { ProctorChatModal } from "./ProctorChatModal";

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
  /** When set, only these students are shown — TestOverviewPage passes the
   *  selected course's roster so the live view matches the page's course
   *  scope (other courses' sitters are noise). null = no scoping. */
  scopeStudentIds?: ReadonlySet<string> | null;
  /** Course name for the scope note in the header (paired with scopeStudentIds). */
  scopeLabel?: string | null;
  /** Runs with an unread student message — owned by TestOverviewPage so the
   *  page + this modal share ONE realtime subscription (no phantom dots). */
  newMsgRuns?: Set<string>;
  onSeenRun?: (runId: string) => void;
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

/** A single labelled progress fact in the row's meta strip. The tiny caption
 *  above each value is what makes the monitor self-explanatory — no proctor
 *  should have to guess what "2 marked" means. */
function MetaItem({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-xs text-slate-700 dark:text-slate-200">{children}</dd>
    </div>
  );
}

export function TestMonitorModal({ slug, title, isAdmin = false, scopeStudentIds = null, scopeLabel = null, newMsgRuns, onSeenRun, onClose }: TestMonitorModalProps) {
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
    async (runId: string | null, pause: boolean, who: string, reason?: string): Promise<void> => {
      if (!runId) return;
      setBusyRun(runId);
      try {
        const { error: rpcError } = await supabase.rpc("proctor_set_pause", {
          p_run_id: runId,
          p_paused: pause,
        });
        if (rpcError) {
          toast.error(pause ? "Couldn't pause" : "Couldn't resume", rpcError.message);
          return;
        }
        if (pause && reason && reason.trim()) {
          await supabase
            .rpc("proctor_send_message", { p_run_id: runId, p_kind: "pause", p_body: reason.trim() })
            .then(({ error: e }) => {
              if (e) toast.error("Paused, but the note didn't send", e.message);
            });
        }
        toast.success(pause ? `Paused ${who}` : `Resumed ${who}`);
        void refresh();
      } finally {
        setBusyRun(null);
      }
    },
    [toast, refresh],
  );

  // Live proctor ⇄ student chat (0113). The unread-dot set + its realtime
  // subscription live in TestOverviewPage (the parent) so there's exactly ONE
  // subscription; this modal just reads `newMsgRuns` and reports "seen".
  const [chatTarget, setChatTarget] = useState<{ runId: string; name: string } | null>(null);
  const openChat = (runId: string, name: string): void => {
    setChatTarget({ runId, name });
    onSeenRun?.(runId);
  };

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

  // Apply the page's course scope (the RPC is slug-wide). Done client-side so
  // the poll loop stays one RPC; the set is small (a course roster).
  const visibleRows = useMemo(
    () =>
      scopeStudentIds
        ? rows.filter((r) => scopeStudentIds.has(r.student_id))
        : rows,
    [rows, scopeStudentIds],
  );

  const taking = visibleRows.filter((r) => r.state === "in_progress").length;
  const done = visibleRows.filter((r) => r.state === "submitted").length;
  const notStarted = visibleRows.filter((r) => r.state === "not_started").length;

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
    const next = [...visibleRows].sort((a, b) => {
      const r = rank(a.state) - rank(b.state);
      if (r !== 0) return r;
      const at = attention(b) - attention(a);
      if (at !== 0) return at;
      return (a.student_name ?? "").localeCompare(b.student_name ?? "");
    });
    return { sorted: next, flagged: visibleRows.filter((r) => attention(r) > 0).length };
  }, [visibleRows, tick]);

  return (
    <>
    <ResponsiveModal
      open={true}
      onClose={onClose}
      size="3xl"
      title={
        <span className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="truncate">Live monitor — {title}</span>
        </span>
      }
      subtitle={
        <>
          {scopeLabel && (
            <span
              className="mr-1 font-medium text-slate-600 dark:text-slate-300"
              title="Scoped to the course selected on the test overview — switch to 'All courses' there to monitor everyone"
            >
              {scopeLabel} ·
            </span>
          )}
          {taking} taking · {done} done · {notStarted} not started
          {flagged > 0 && (
            <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
              · {flagged} need{flagged === 1 ? "s" : ""} attention
            </span>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!loaded ? (
          <SkeletonRows count={4} rowClassName="h-12" />
        ) : error ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : visibleRows.length === 0 ? (
          <p className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {scopeLabel
              ? `No students in ${scopeLabel} are assigned this test yet.`
              : "No students are assigned this test yet."}
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
              const answered = r.answered ?? 0;
              const modQ = r.module_questions ?? 0;
              const pct = modQ > 0 ? Math.round((answered / modQ) * 100) : 0;
              const marked = r.marked ?? 0;
              return (
                <li key={r.student_id} className="bg-white dark:bg-slate-900">
                  <div
                    className={`px-4 py-3 ${
                      flaggedRow ? "bg-rose-50/60 dark:bg-rose-950/20" : ""
                    }`}
                  >
                    {/* ── Header line: who + status/attention + actions ── */}
                    <div className="flex items-center gap-2.5">
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
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {r.student_name ?? "Student"}
                      </span>

                      {/* Attention signals — only the things a proctor must react to */}
                      {r.state === "in_progress" && (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {idle && (
                            <StatusPill
                              tone="warn"
                              label={`Idle ${idleFor}s`}
                              title="No activity heartbeat recently"
                            />
                          )}
                          {flaggedRow && (
                            <StatusPill
                              tone="alert"
                              label="Needs review"
                              title={
                                flagReasons.length
                                  ? flagReasons.map(flagLabel).join(" · ")
                                  : "Flagged for review"
                              }
                            />
                          )}
                          {away > 0 && (
                            <StatusPill
                              tone="warn"
                              label={`Left tab ${away}×${awaySecs > 0 ? ` · ${fmtAwaySecs(awaySecs)}` : ""}`}
                              title="Times the student left the test tab (total time away)"
                            />
                          )}
                          {fmtIntegrity(r.integrity) && (
                            <StatusPill
                              tone="alert"
                              label={fmtIntegrity(r.integrity) ?? ""}
                              title="Integrity signals: copy / paste / left full-screen"
                            />
                          )}
                          {r.paused && <StatusPill tone="paused" label="Paused" />}
                        </div>
                      )}

                      {r.state === "submitted" && (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {flaggedRow && (
                            <StatusPill
                              tone="alert"
                              label="Needs review"
                              title={
                                flagReasons.length
                                  ? flagReasons.map(flagLabel).join(" · ")
                                  : "Flagged for review"
                              }
                            />
                          )}
                          <StatusPill
                            tone="released"
                            label={`Submitted ${fmtTime(r.submitted_at)}`}
                          />
                        </div>
                      )}

                      {r.state === "not_started" && (
                        <StatusPill tone="idle" label="Not started" />
                      )}

                      {/* Live controls (admin only, live sittings only) */}
                      {r.state === "in_progress" && isAdmin && (
                        <div className="flex flex-none items-center gap-1.5 pl-1">
                          {r.run_id && (
                            <RowAction
                              tone="primary"
                              className="relative"
                              onClick={() => openChat(r.run_id ?? "", r.student_name ?? "Student")}
                              title="Message this student (they can reply while paused)"
                              aria-label="Message this student"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.7A8.4 8.4 0 1 1 21 11.5Z" />
                              </svg>
                              {newMsgRuns?.has(r.run_id) && (
                                <span
                                  aria-label="new message"
                                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900"
                                />
                              )}
                            </RowAction>
                          )}
                          <ActionGroup>
                            <RowAction
                              className="rounded-none"
                              disabled={busyRun === r.run_id}
                              onClick={() =>
                                void setPause(r.run_id, !r.paused, r.student_name ?? "student")
                              }
                              title={
                                r.paused
                                  ? "Resume this student's timer"
                                  : "Freeze this student's timer"
                              }
                            >
                              {busyRun === r.run_id ? "…" : r.paused ? "Resume" : "Pause"}
                            </RowAction>
                            <RowAction
                              className="rounded-none"
                              disabled={busyRun === r.run_id}
                              onClick={() =>
                                void addTime(r.run_id, 300, r.student_name ?? "student")
                              }
                              title="Give this student 5 more minutes on the current section"
                            >
                              {busyRun === r.run_id ? "…" : "+5 min"}
                            </RowAction>
                          </ActionGroup>
                        </div>
                      )}
                    </div>

                    {/* ── Meta strip: clearly-labelled progress facts (live only) ── */}
                    {r.state === "in_progress" && (
                      <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2.5 pl-[34px] sm:flex sm:flex-wrap sm:items-start sm:gap-x-7">
                        <MetaItem label="On question">
                          {r.module_label
                            ? `Module ${r.module_position}`
                            : `Module ${r.module_position ?? "?"}`}{" "}
                          · Q{r.current_question ?? "?"}
                        </MetaItem>

                        <MetaItem label="Answered this section">
                          <span className="inline-flex items-center gap-2">
                            <span className="tabular-nums">
                              {answered} of {modQ || "?"}
                            </span>
                            {modQ > 0 && (
                              <span
                                className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 sm:inline-block"
                                aria-hidden
                              >
                                <span
                                  className="block h-full rounded-full bg-blue-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </span>
                            )}
                          </span>
                        </MetaItem>

                        <MetaItem
                          label="Marked for review"
                          title="Questions the student bookmarked to revisit before submitting — a normal study habit, not a warning."
                        >
                          {marked > 0 ? (
                            <span className="tabular-nums">
                              {marked} question{marked === 1 ? "" : "s"}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">None</span>
                          )}
                        </MetaItem>

                        <MetaItem label="Time left this section">
                          <span
                            className={`inline-flex items-center gap-1 tabular-nums font-semibold ${lowTime ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"}`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <circle cx="12" cy="12" r="9" />
                              <path d="M12 7.5V12l3 1.8" />
                            </svg>
                            {fmtClock(r.seconds_remaining)}
                          </span>
                        </MetaItem>

                        {r.started_at && (
                          <MetaItem label="Started at">{fmtTime(r.started_at)}</MetaItem>
                        )}
                      </dl>
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
    </ResponsiveModal>
    {chatTarget &&
      (() => {
        const rNow = rows.find((x) => x.run_id === chatTarget.runId);
        return (
          <ProctorChatModal
            runId={chatTarget.runId}
            studentName={chatTarget.name}
            paused={rNow?.paused ?? false}
            pauseBusy={busyRun === chatTarget.runId}
            onPause={(p, reason) => setPause(chatTarget.runId, p, chatTarget.name, reason)}
            onClose={() => setChatTarget(null)}
          />
        );
      })()}
    </>
  );
}
