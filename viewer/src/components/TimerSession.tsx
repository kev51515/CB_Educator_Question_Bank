import { useCallback, useEffect, useRef, useState } from "react";
import { IDENTITY } from "../lib/designTokens";
import { useFocusTrap } from "../hooks";

// ---------------------------------------------------------------------------
// useTimer hook
// ---------------------------------------------------------------------------

interface UseTimerReturn {
  remaining: number;
  elapsed: number;
  isUp: boolean;
  pct: number;
  formatted: string;
  pause: () => void;
  resume: () => void;
  isPaused: boolean;
}

export function useTimer(totalSeconds: number, active: boolean): UseTimerReturn {
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when session changes
  useEffect(() => {
    setElapsed(0);
    setIsPaused(false);
  }, [totalSeconds, active]);

  useEffect(() => {
    if (!active || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= totalSeconds) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return totalSeconds;
        }
        return prev + 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, isPaused, totalSeconds]);

  const remaining = Math.max(0, totalSeconds - elapsed);
  const isUp = remaining === 0 && active;
  const pct = totalSeconds > 0 ? remaining / totalSeconds : 0;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);

  return { remaining, elapsed, isUp, pct, formatted, pause, resume, isPaused };
}

// ---------------------------------------------------------------------------
// TimerBar
// ---------------------------------------------------------------------------

interface TimerBarProps {
  active: boolean;
  totalSeconds: number;
  onTimeUp: () => void;
  onStop: () => void;
  questionIndex: number;
  questionCount: number;
  onNext: () => void;
  onPrev: () => void;
}

export function TimerBar({
  active,
  totalSeconds,
  onTimeUp,
  onStop,
  questionIndex,
  questionCount,
  onNext,
  onPrev,
}: TimerBarProps) {
  const timer = useTimer(totalSeconds, active);
  const firedTimeUp = useRef(false);
  const [showTimesUp, setShowTimesUp] = useState(false);

  // Fire onTimeUp exactly once
  useEffect(() => {
    if (timer.isUp && !firedTimeUp.current) {
      firedTimeUp.current = true;
      setShowTimesUp(true);
      onTimeUp();
      const id = setTimeout(() => setShowTimesUp(false), 2000);
      return () => clearTimeout(id);
    }
  }, [timer.isUp, onTimeUp]);

  // Reset fired flag when session restarts
  useEffect(() => {
    if (!active) {
      firedTimeUp.current = false;
      setShowTimesUp(false);
    }
  }, [active]);

  if (!active) return null;

  const timerColorClass =
    timer.pct > 0.5
      ? "text-emerald-600"
      : timer.pct > 0.25
        ? "text-amber-600"
        : "text-rose-600";

  const pulseClass = timer.pct <= 0.25 && timer.pct > 0 ? "animate-pulse" : "";

  const flashClass = showTimesUp ? "bg-rose-100 border-rose-200" : "bg-ink-50 border-ink-150";

  return (
    <div
      className={`flex items-center gap-3 h-9 px-3 border-b text-[13px] transition-colors ${flashClass}`}
      role="timer"
      aria-live="polite"
      aria-label={`Timer: ${timer.formatted} remaining`}
    >
      {/* Left: Timer display */}
      <div className="flex items-center gap-2 shrink-0">
        {showTimesUp ? (
          <span className="font-semibold text-rose-600">Time's up!</span>
        ) : (
          <>
            <span
              className={`font-mono tabular-nums font-semibold ${timerColorClass} ${pulseClass}`}
            >
              {timer.formatted}
            </span>
            {timer.isPaused && (
              <span className="text-[11px] text-ink-400 font-medium">PAUSED</span>
            )}
            <button
              type="button"
              onClick={timer.isPaused ? timer.resume : timer.pause}
              className="w-5 h-5 flex items-center justify-center rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors focus-ring"
              aria-label={timer.isPaused ? "Resume timer" : "Pause timer"}
            >
              {timer.isPaused ? (
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
                  <rect x="5" y="4" width="4" height="16" rx="1" />
                  <rect x="15" y="4" width="4" height="16" rx="1" />
                </svg>
              )}
            </button>
          </>
        )}
      </div>

      {/* Center: Progress */}
      <div className="flex-1 text-center text-ink-500 tabular-nums">
        Question {questionIndex} of {questionCount}
      </div>

      {/* Right: Navigation + End */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onPrev}
          disabled={questionIndex <= 1}
          className="w-6 h-6 flex items-center justify-center rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors focus-ring disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Previous question"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={questionIndex >= questionCount}
          className="w-6 h-6 flex items-center justify-center rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors focus-ring disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Next question"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div className="w-px h-4 bg-ink-200 mx-1" />
        <button
          type="button"
          onClick={onStop}
          className="px-2 py-0.5 text-[12px] font-medium text-rose-600 hover:bg-rose-50 rounded transition-colors focus-ring"
        >
          End session
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimerSetup modal
// ---------------------------------------------------------------------------

interface TimerSetupProps {
  open: boolean;
  onClose: () => void;
  filteredCount: number;
  onStart: (config: { minutes: number; questionCount: number }) => void;
}

const PRESETS = [10, 20, 35, 45] as const;

function suggestQuestionCount(minutes: number, max: number): number {
  // Roughly ~1.75 min per question for SAT pacing
  const suggested = Math.round(minutes / 1.75);
  return Math.max(1, Math.min(suggested, max));
}

export function TimerSetup({ open, onClose, filteredCount, onStart }: TimerSetupProps) {
  const [minutes, setMinutes] = useState(35);
  const [customMinutes, setCustomMinutes] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [questionCount, setQuestionCount] = useState(() =>
    suggestQuestionCount(35, filteredCount),
  );
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, open);

  // Update suggestion when minutes or filteredCount changes
  useEffect(() => {
    const m = isCustom ? Number(customMinutes) || 0 : minutes;
    setQuestionCount(suggestQuestionCount(m, filteredCount));
  }, [minutes, customMinutes, isCustom, filteredCount]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const effectiveMinutes = isCustom ? Math.max(1, Math.min(120, Number(customMinutes) || 0)) : minutes;
  const effectiveCount = Math.max(1, Math.min(filteredCount, questionCount));
  const canStart = effectiveMinutes > 0 && effectiveCount > 0 && filteredCount > 0;

  const handlePreset = (m: number) => {
    setMinutes(m);
    setIsCustom(false);
    setCustomMinutes("");
  };

  const handleStart = () => {
    if (!canStart) return;
    onStart({ minutes: effectiveMinutes, questionCount: effectiveCount });
  };

  return (
    <div
      className="fixed inset-0 z-20 bg-ink-800/25 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="timer-setup-title"
    >
      <div
        ref={dialogRef}
        className={"bg-white rounded-2xl shadow-modal border border-ink-100 border-t-[3px] " + IDENTITY.difficulty.topBorder + " w-full max-w-sm p-6"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 id="timer-setup-title" className="text-[15px] font-semibold tracking-tight">
            Timed Practice
          </h2>
          <button
            data-close
            data-autofocus
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Duration presets */}
        <div className="mb-4">
          <label className="block text-[12px] font-medium text-ink-600 mb-2">Duration</label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handlePreset(m)}
                className={
                  "px-3 py-1.5 text-[13px] font-medium rounded-lg transition-colors focus-ring " +
                  (!isCustom && minutes === m
                    ? "bg-accent-600 text-white"
                    : "bg-ink-100 text-ink-700 hover:bg-ink-200")
                }
              >
                {m} min
                {m === 35 && (
                  <span className="ml-1 text-[10px] opacity-70">(SAT)</span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsCustom(true)}
              className={
                "px-3 py-1.5 text-[13px] font-medium rounded-lg transition-colors focus-ring " +
                (isCustom
                  ? "bg-accent-600 text-white"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200")
              }
            >
              Custom
            </button>
          </div>
          {isCustom && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={120}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="Minutes"
                className="w-24 px-2.5 py-1.5 text-[13px] border border-ink-200 rounded-lg focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 tabular-nums"
                autoFocus
              />
              <span className="text-[12px] text-ink-500">minutes</span>
            </div>
          )}
        </div>

        {/* Question count */}
        <div className="mb-5">
          <label className="block text-[12px] font-medium text-ink-600 mb-2">
            Questions
            <span className="font-normal text-ink-400 ml-1">
              ({filteredCount} available)
            </span>
          </label>
          <input
            type="number"
            min={1}
            max={filteredCount}
            value={questionCount}
            onChange={(e) => setQuestionCount(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 px-2.5 py-1.5 text-[13px] border border-ink-200 rounded-lg focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 tabular-nums"
          />
        </div>

        {/* Summary + Start */}
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-ink-500 tabular-nums">
            {effectiveCount} question{effectiveCount !== 1 ? "s" : ""} in {effectiveMinutes} min
          </p>
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className="px-4 py-1.5 text-[13px] font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors focus-ring disabled:opacity-40 disabled:pointer-events-none"
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
