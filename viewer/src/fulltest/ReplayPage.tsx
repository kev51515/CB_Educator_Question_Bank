/**
 * ReplayPage — proctor replay of one student's sitting.
 *
 * Scrub or play the captured action stream and watch the test reconstruct
 * itself: the question they're on, answers appearing/changing, highlights
 * painting on in color, eliminations, flags, the open note, calculator use —
 * "almost exactly what the student did" — plus a per-question dwell heatmap to
 * jump to where time went, and the integrity/answer-activity timeline below.
 *
 * Read-only: reuses QuestionPane (disabled) driven by the reconstructed state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { ROUTES, buildPath } from "@/lib/routes";
import { QuestionPane } from "./QuestionPane";
import ProctorTimeline from "./ProctorTimeline";
import { getRunReplay, type ReplayData } from "./api";
import {
  reconstructAt,
  buildDwell,
  buildQuestionIndex,
  qKey,
  fmtClock,
  type DwellEntry,
} from "./replayModel";
import type { Letter } from "./types";

const SPEEDS = [1, 2, 4, 8] as const;

export function ReplayPage(): JSX.Element {
  const { slug = "", runId = "" } = useParams<{ slug: string; runId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tMs, setTMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);

  // --- fetch ----------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    getRunReplay(runId)
      .then((d) => {
        if (!alive) return;
        setData(d);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "Could not load this replay.";
        setErr(msg);
        toast.error("Replay unavailable", msg);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [runId, toast]);

  // --- derived --------------------------------------------------------------
  const startMs = useMemo(
    () => (data?.run.started_at ? new Date(data.run.started_at).getTime() : 0),
    [data],
  );
  const events = data?.events ?? [];
  const durationMs = useMemo(() => {
    if (!data) return 0;
    const end = data.run.submitted_at ? new Date(data.run.submitted_at).getTime() : NaN;
    if (!Number.isNaN(end) && startMs) return Math.max(0, end - startMs);
    // No submit time → span to the last event.
    const last = events.reduce((mx, e) => {
      const at = new Date(e.at).getTime();
      return Number.isNaN(at) ? mx : Math.max(mx, at - startMs);
    }, 0);
    return last;
  }, [data, events, startMs]);

  const qIndex = useMemo(() => buildQuestionIndex(data?.modules ?? []), [data]);
  const dwell = useMemo(() => buildDwell(events, startMs), [events, startMs]);
  const maxDwell = useMemo(() => dwell.reduce((mx, d) => Math.max(mx, d.seconds), 0), [dwell]);
  const state = useMemo(() => reconstructAt(events, tMs, startMs), [events, tMs, startMs]);

  // --- playback loop --------------------------------------------------------
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    lastTsRef.current = null;
    const tick = (ts: number) => {
      if (lastTsRef.current != null) {
        const dt = (ts - lastTsRef.current) * speedRef.current;
        setTMs((prev) => {
          const next = prev + dt;
          if (next >= durationMs) {
            setPlaying(false);
            return durationMs;
          }
          return next;
        });
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, durationMs]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      // Restart from 0 if at the end.
      if (!p && tMs >= durationMs) setTMs(0);
      return !p;
    });
  }, [tMs, durationMs]);

  const jumpTo = useCallback((ms: number) => {
    setPlaying(false);
    setTMs(Math.max(0, ms));
  }, []);

  // --- render ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-72 rounded" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Replay unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {err ?? "This sitting could not be loaded."}
        </p>
        <button
          type="button"
          onClick={() => navigate(buildPath(ROUTES.TEST_OVERVIEW, { slug }))}
          className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Back to test overview
        </button>
      </div>
    );
  }

  const { run } = data;
  const noCapture = events.length === 0;
  const curKey = qKey(state.module, state.question);
  const curQ = qIndex.get(curKey);
  const curNote = state.notes[curKey] ?? "";
  const atEnd = tMs >= durationMs && durationMs > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate(buildPath(ROUTES.TEST_OVERVIEW, { slug }))}
            className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            ← {run.test.short_title || run.test.title}
          </button>
          <h1 className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">
            Replay · {run.student_name || "Student"}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {run.status === "submitted" ? "Submitted" : run.status} ·{" "}
            {run.proctoring_level === "off"
              ? "proctoring was off"
              : `proctoring: ${run.proctoring_level}`}{" "}
            · {fmtClock(durationMs)} total
          </p>
        </div>
      </div>

      {noCapture ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            No actions were recorded for this sitting.
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            Replay captures answers, highlights, notes and timing only while
            proctoring is set to <strong>soft</strong> or <strong>strict</strong>.
            Turn proctoring on (from the test overview) before the next sitting to
            record a replay.
          </p>
        </div>
      ) : (
        <>
          {/* Transport controls */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              title={playing ? "Pause" : atEnd ? "Replay from start" : "Play"}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-700"
            >
              {playing ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <span className="flex-none tabular-nums text-xs font-medium text-slate-600 dark:text-slate-300">
              {fmtClock(tMs)} / {fmtClock(durationMs)}
            </span>

            <input
              type="range"
              min={0}
              max={Math.max(1, durationMs)}
              step={500}
              value={Math.min(tMs, durationMs)}
              onChange={(e) => jumpTo(Number(e.target.value))}
              aria-label="Scrub replay"
              className="h-1.5 min-w-[160px] flex-1 cursor-pointer accent-indigo-600"
            />

            <div className="flex flex-none items-center gap-1" role="group" aria-label="Playback speed">
              {SPEEDS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => setSpeed(sp)}
                  aria-pressed={speed === sp}
                  className={[
                    "rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition",
                    speed === sp
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                      : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                  ].join(" ")}
                >
                  {sp}×
                </button>
              ))}
            </div>

            <span className="flex-none rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {state.module != null && state.question != null
                ? `Module ${state.module} · Q${state.question}`
                : "—"}
              {state.calcOpen && (
                <span className="ml-1.5 text-blue-600 dark:text-blue-400" title="Calculator open">
                  · calc
                </span>
              )}
            </span>
          </div>

          {/* Dwell heatmap */}
          <DwellHeatmap
            dwell={dwell}
            maxDwell={maxDwell}
            currentKey={curKey}
            onJump={(ms) => jumpTo(ms)}
          />

          {/* Reconstructed question (read-only) */}
          {curNote.trim() && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <span className="font-semibold">Note:</span> {curNote}
            </div>
          )}
          {curQ ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <QuestionPane
                key={curQ.id}
                question={curQ}
                value={state.answers[curKey] ?? null}
                onChange={() => {}}
                disabled
                marked={state.marks.has(curKey)}
                eliminated={state.eliminations[curKey] as Set<Letter> | undefined}
                highlights={state.highlights[curKey] ?? []}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Press play, or click a question in the heatmap, to see what the
              student was doing.
            </div>
          )}

          {/* Integrity + answer-activity timeline (reused) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Session timeline
            </h2>
            <ProctorTimeline
              events={events}
              startedAt={run.started_at}
              submittedAt={run.submitted_at}
            />
          </div>
        </>
      )}
    </div>
  );
}

// --- dwell heatmap ----------------------------------------------------------

interface DwellHeatmapProps {
  dwell: DwellEntry[];
  maxDwell: number;
  currentKey: string;
  onJump: (ms: number) => void;
}

function DwellHeatmap({ dwell, maxDwell, currentKey, onJump }: DwellHeatmapProps): JSX.Element | null {
  if (dwell.length === 0) return null;
  // Group cells by module for labelled rows.
  const byModule = new Map<number, DwellEntry[]>();
  for (const d of dwell) {
    const list = byModule.get(d.module);
    if (list) list.push(d);
    else byModule.set(d.module, [d]);
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Time per question
        </h2>
        <span
          aria-hidden
          title="Active seconds the student spent on each question (tab-away time excluded). Darker = longer. Click a question to jump the replay to when they first opened it."
          className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300"
        >
          ?
        </span>
      </div>
      <div className="space-y-2">
        {[...byModule.entries()].map(([mod, cells]) => (
          <div key={mod} className="flex items-center gap-2">
            <span className="w-16 flex-none text-[10px] font-medium text-slate-400 dark:text-slate-500">
              Module {mod}
            </span>
            <div className="flex flex-wrap gap-1">
              {cells.map((c) => {
                const intensity = maxDwell > 0 ? c.seconds / maxDwell : 0;
                const isCur = currentKey === `${c.module}:${c.number}`;
                const mm = Math.floor(c.seconds / 60);
                const ss = c.seconds % 60;
                const label = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
                return (
                  <button
                    key={c.number}
                    type="button"
                    disabled={c.firstSeenMs == null}
                    onClick={() => c.firstSeenMs != null && onJump(c.firstSeenMs)}
                    title={`Module ${c.module} · Q${c.number} · ${label}`}
                    style={{
                      backgroundColor: `rgba(79,70,229,${0.12 + intensity * 0.78})`,
                    }}
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded text-[10px] font-semibold tabular-nums transition",
                      intensity > 0.55 ? "text-white" : "text-slate-700 dark:text-slate-100",
                      isCur ? "ring-2 ring-offset-1 ring-slate-900 dark:ring-white dark:ring-offset-slate-900" : "",
                      c.firstSeenMs != null ? "hover:scale-110 cursor-pointer" : "cursor-default opacity-60",
                    ].join(" ")}
                  >
                    {c.number}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Darker = more time. Click a question to jump there.
      </p>
    </div>
  );
}

export default ReplayPage;
