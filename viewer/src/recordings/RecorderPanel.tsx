/**
 * RecorderPanel — the "spurt" capture experience for a recording in progress.
 *
 * Rendered on the recording detail page while `recording.status === 'recording'`
 * and the viewer is the owner. Each Stop Part finalizes the current Part, uploads
 * it, and kicks off its transcription independently; End closes the session.
 *
 * The UI is a focused capture surface: a big record control, a live animated
 * waveform, a prominent timer, and a strip of the parts captured so far (with
 * their transcription status) so the educator always knows where they are.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components";
import {
  PartRecorder,
  isMeetingCaptureSupported,
  isRecordingSupported,
  type CaptureMode,
} from "./recorder";
import { endRecording, uploadAndTranscribePart } from "./useRecordings";
import type { Recording, RecordingPart } from "./types";

interface RecorderPanelProps {
  recording: Recording;
  /** Parts already captured this session (drives the next index + the strip). */
  parts: RecordingPart[];
  /** Called after a Part uploads so the parent can refresh the Parts list. */
  onPartAdded: () => void;
  /** Called once the session is ended. */
  onEnded: () => void;
}

type Phase = "idle" | "recording" | "paused";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const BARS = 48;

/** Live animated frequency waveform while recording (dimmed when paused). */
function LiveWaveform({
  active,
  paused,
  getStream,
}: {
  active: boolean;
  paused: boolean;
  getStream: () => MediaStream | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!active) return;
    const stream = getStream();
    const canvas = canvasRef.current;
    if (!stream || !canvas) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const smoothed = new Array(BARS).fill(0);
    let raf = 0;

    const draw = () => {
      analyser.getByteFrequencyData(bins);
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 600;
      const cssH = canvas.clientHeight || 56;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cssW, cssH);
      const slot = cssW / BARS;
      const barW = Math.max(2, slot * 0.55);
      const mid = cssH / 2;
      const isPaused = pausedRef.current;
      const step = Math.floor(bins.length / BARS) || 1;
      for (let i = 0; i < BARS; i++) {
        const v = bins[i * step] / 255; // 0..1
        // ease toward the new value for a smooth, lively motion
        smoothed[i] += ((isPaused ? 0.04 : v) - smoothed[i]) * 0.35;
        const h = Math.max(2, smoothed[i] * (cssH - 6));
        const x = i * slot + (slot - barW) / 2;
        g.fillStyle = isPaused ? "#94a3b8" : "#6366f1"; // slate-400 / indigo-500
        g.beginPath();
        g.roundRect(x, mid - h / 2, barW, h, barW / 2);
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      void ctx.close();
    };
  }, [active, getStream]);

  return <canvas ref={canvasRef} className="h-14 w-full" aria-hidden />;
}

/** A captured-this-session part chip showing its CLEAR stage, with a spinner
 *  while it's still working (each part uploads + transcribes on its own). */
function PartChip({ part }: { part: RecordingPart }) {
  const done = part.status === "transcribed";
  const failed = part.status === "failed";
  const active = !done && !failed;
  const stage =
    part.status === "uploading"
      ? "uploading"
      : part.status === "queued"
        ? "processing"
        : part.status === "transcribing"
          ? "transcribing"
          : done
            ? "done"
            : "failed";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        done
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : failed
            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
            : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
      }`}
      title={part.error ?? part.status}
    >
      {active && (
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      )}
      Part {part.part_index} · {stage}
    </span>
  );
}

export function RecorderPanel({
  recording,
  parts,
  onPartAdded,
  onEnded,
}: RecorderPanelProps) {
  const toast = useToast();
  const recorderRef = useRef<PartRecorder | null>(null);
  const nextIndexRef = useRef(parts.length + 1);
  const totalRef = useRef(0); // accumulated session duration (ms)
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("mic");
  const supported = isRecordingSupported();
  const meetingSupported = isMeetingCaptureSupported();
  const sourceLocked = nextIndexRef.current > 1;
  const nextPart = nextIndexRef.current;

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed((e) => e + 250), 250);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    return () => recorderRef.current?.dispose();
  }, []);

  // Space toggles Pause/Resume while a Part is active.
  useEffect(() => {
    if (phase !== "recording" && phase !== "paused") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      e.preventDefault();
      const rec = recorderRef.current;
      if (!rec) return;
      if (phase === "recording") {
        rec.pause();
        setPhase("paused");
      } else {
        rec.resume();
        setPhase("recording");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase]);

  function getRecorder(): PartRecorder {
    if (!recorderRef.current) recorderRef.current = new PartRecorder();
    return recorderRef.current;
  }

  // Stable getter so the waveform's AudioContext effect isn't torn down on every
  // timer tick (the panel re-renders every 250ms while recording).
  const getStream = useCallback(() => recorderRef.current?.getStream() ?? null, []);

  async function startPart() {
    try {
      const rec = getRecorder();
      rec.setMode(mode);
      await rec.startPart();
      setElapsed(0);
      setPhase("recording");
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow mic access and try again."
          : (e as Error).message;
      toast.error(msg);
    }
  }

  function pause() {
    getRecorder().pause();
    setPhase("paused");
  }
  function resume() {
    getRecorder().resume();
    setPhase("recording");
  }

  async function finishPart(): Promise<boolean> {
    const rec = recorderRef.current;
    if (!rec || !rec.isActive()) return true;
    setBusy(true);
    try {
      const result = await rec.stopPart();
      const idx = nextIndexRef.current;
      await uploadAndTranscribePart(recording, idx, result);
      nextIndexRef.current = idx + 1;
      totalRef.current += result.durationMs;
      setPhase("idle");
      setElapsed(0);
      onPartAdded();
      toast.success(`Part ${idx} saved — transcribing…`);
      return true;
    } catch (e) {
      toast.error(`Couldn't save that part: ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    const ok = await finishPart();
    if (!ok) return;
    try {
      const anyParts = nextIndexRef.current > 1;
      await endRecording(recording.id, Math.round(totalRef.current / 1000), anyParts);
      recorderRef.current?.dispose();
      recorderRef.current = null;
      onEnded();
    } catch (e) {
      toast.error(`Couldn't end the session: ${(e as Error).message}`);
    }
  }

  if (!supported) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
        This browser can't record audio directly. Use the <strong>Upload audio</strong> option to add a file instead.
      </div>
    );
  }

  const recording_ = phase === "recording";
  const paused = phase === "paused";
  const active = recording_ || paused;

  const btn =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";
  const ghost = `${btn} border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Status bar */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            recording_ ? "animate-pulse bg-red-500" : paused ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-600"
          }`}
          aria-hidden
        />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {recording_
            ? `Recording Part ${nextPart}`
            : paused
              ? `Part ${nextPart} — paused`
              : nextPart > 1
                ? `Ready for Part ${nextPart}`
                : "Ready to record"}
        </span>
        {active && (
          <span className="ml-auto text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {fmt(elapsed)}
          </span>
        )}
      </div>

      <div className="px-5 py-5">
        {/* Waveform while live, else an idle baseline */}
        {active ? (
          <LiveWaveform active={active} paused={paused} getStream={getStream} />
        ) : (
          <div className="flex h-14 items-center justify-center gap-1" aria-hidden>
            {Array.from({ length: 28 }).map((_, i) => (
              <span key={i} className="h-1.5 w-1 rounded-full bg-slate-200 dark:bg-slate-700" />
            ))}
          </div>
        )}

        {/* Source selector — before the first Part only */}
        {!active && !sourceLocked && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMode("mic")}
                className={`px-3 py-1.5 font-medium ${mode === "mic" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                Microphone
              </button>
              <button
                type="button"
                onClick={() => meetingSupported && setMode("meeting")}
                disabled={!meetingSupported}
                title={meetingSupported ? "" : "Tab-audio capture needs Chrome or Edge"}
                className={`px-3 py-1.5 font-medium disabled:opacity-40 ${mode === "meeting" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                Meeting (tab + mic)
              </button>
            </div>
            {mode === "meeting" && (
              <p className="max-w-md text-center text-xs text-slate-500 dark:text-slate-400">
                You'll be asked to share a tab — pick your <strong>Google Meet / Zoom</strong> tab and tick{" "}
                <strong>"Also share tab audio"</strong>. We capture everyone's audio + your mic.
              </p>
            )}
          </div>
        )}

        {/* Primary controls */}
        <div className="mt-5 flex items-center justify-center gap-2">
          {!active && (
            <button
              type="button"
              onClick={startPart}
              disabled={busy}
              className={`${btn} bg-red-600 px-5 py-2.5 text-white shadow-sm hover:bg-red-700`}
            >
              <span className="h-3 w-3 rounded-full bg-white" />
              {nextPart > 1 ? `Record Part ${nextPart}` : "Start recording"}
            </button>
          )}
          {recording_ && (
            <button type="button" onClick={pause} className={ghost}>
              Pause
            </button>
          )}
          {paused && (
            <button type="button" onClick={resume} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
              Resume
            </button>
          )}
          {active && (
            <button type="button" onClick={() => void finishPart()} disabled={busy} className={ghost}>
              {busy ? "Saving…" : "Stop part"}
            </button>
          )}
          {(active || nextPart > 1) && (
            <button
              type="button"
              onClick={() => void endSession()}
              disabled={busy}
              className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}
            >
              End session
            </button>
          )}
        </div>

        {active && (
          <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
            <kbd className="rounded border border-slate-300 px-1 font-sans dark:border-slate-600">Space</kbd> = pause/resume
          </p>
        )}

        {/* Captured-this-session strip */}
        {parts.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <span className="mr-1 text-xs text-slate-400">Captured:</span>
            {parts.map((p) => (
              <PartChip key={p.id} part={p} />
            ))}
          </div>
        )}

        {parts.length === 0 && !active && (
          <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            Record in short bursts — each <strong>Stop part</strong> transcribes on its own, and the parts are
            stitched in order when you end.
          </p>
        )}
      </div>
    </div>
  );
}
