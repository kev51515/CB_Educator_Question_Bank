import { useCallback, useEffect, useRef, useState } from "react";

// TimerSetup (the timed-practice config modal) lives in ./TimerSetup so it can
// be lazy-loaded (this module is statically imported for TimerBar).

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

