/**
 * RecorderPanel — the "spurt" capture controls for a recording in progress.
 *
 * Rendered on the recording detail page while `recording.status === 'recording'`
 * and the viewer is the owner. Each Stop Part finalizes the current Part, uploads
 * it, and kicks off its transcription independently; End closes the session.
 */
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components";
import { PartRecorder, isRecordingSupported } from "./recorder";
import { endRecording, uploadAndTranscribePart } from "./useRecordings";
import type { Recording } from "./types";

interface RecorderPanelProps {
  recording: Recording;
  /** Number of Parts already captured (drives the next part_index). */
  existingPartCount: number;
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

export function RecorderPanel({
  recording,
  existingPartCount,
  onPartAdded,
  onEnded,
}: RecorderPanelProps) {
  const toast = useToast();
  const recorderRef = useRef<PartRecorder | null>(null);
  const nextIndexRef = useRef(existingPartCount + 1);
  const totalRef = useRef(0); // accumulated session duration (ms)
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const supported = isRecordingSupported();

  // Tick the current-part timer while actively recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed((e) => e + 250), 250);
    return () => clearInterval(t);
  }, [phase]);

  // Release the mic if the panel unmounts mid-session.
  useEffect(() => {
    return () => recorderRef.current?.dispose();
  }, []);

  function getRecorder(): PartRecorder {
    if (!recorderRef.current) recorderRef.current = new PartRecorder();
    return recorderRef.current;
  }

  async function startPart() {
    try {
      await getRecorder().startPart();
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

  /** Stop the active Part, upload + transcribe it. Returns true on success. */
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
      await endRecording(
        recording.id,
        Math.round(totalRef.current / 1000),
        anyParts,
      );
      recorderRef.current?.dispose();
      recorderRef.current = null;
      onEnded();
    } catch (e) {
      toast.error(`Couldn't end the session: ${(e as Error).message}`);
    }
  }

  if (!supported) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        This browser can't record audio directly. Use the{" "}
        <strong>Upload audio</strong> option to add a file instead.
      </div>
    );
  }

  const recording_ = phase === "recording";
  const paused = phase === "paused";
  const active = recording_ || paused;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center gap-3">
        {/* Live status dot */}
        <span
          className={`inline-block h-3 w-3 rounded-full ${
            recording_ ? "animate-pulse bg-red-500" : paused ? "bg-amber-400" : "bg-gray-300"
          }`}
          aria-hidden
        />
        <div className="flex-1">
          <div className="font-medium">
            {recording_
              ? `Recording Part ${nextIndexRef.current}…`
              : paused
                ? `Part ${nextIndexRef.current} paused`
                : nextIndexRef.current > 1
                  ? `Ready for Part ${nextIndexRef.current}`
                  : "Ready to record"}
          </div>
          <div className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
            {active ? fmt(elapsed) : "Press Record to start a part"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!active && (
          <button
            type="button"
            onClick={startPart}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-white" /> Record
            {nextIndexRef.current > 1 ? " next part" : ""}
          </button>
        )}
        {recording_ && (
          <button
            type="button"
            onClick={pause}
            className="rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Pause
          </button>
        )}
        {paused && (
          <button
            type="button"
            onClick={resume}
            className="rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Resume
          </button>
        )}
        {active && (
          <button
            type="button"
            onClick={() => void finishPart()}
            disabled={busy}
            className="rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Stop part"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={busy}
          className="ml-auto rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          End session
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Record in short bursts — each <strong>Stop part</strong> transcribes on
        its own, and parts are stitched in order (Part 1, Part 2…) when you end.
      </p>
    </div>
  );
}
