/**
 * useTestTimer — countdown timer for a timed test.
 *
 * - `totalSeconds = 0` disables the timer (returns `{ timeLeft: null }`).
 * - Calls `onTimeUp` exactly once when the timer crosses zero.
 * - `timerWarning` triggers at <=5 minutes, `timerCritical` at <=1 minute.
 */
import { useEffect, useRef, useState } from "react";

interface UseTestTimerOptions {
  totalSeconds: number;
  /** Identity key — when this changes the timer resets. */
  sessionKey: string;
  onTimeUp: () => void;
}

interface UseTestTimerResult {
  timeLeft: number | null;
  timerWarning: boolean;
  timerCritical: boolean;
}

const WARNING_THRESHOLD = 5 * 60;
const CRITICAL_THRESHOLD = 60;

export function useTestTimer({
  totalSeconds,
  sessionKey,
  onTimeUp,
}: UseTestTimerOptions): UseTestTimerResult {
  const [timeLeft, setTimeLeft] = useState<number | null>(
    totalSeconds > 0 ? totalSeconds : null,
  );
  const calledRef = useRef(false);
  const onTimeUpRef = useRef(onTimeUp);

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    calledRef.current = false;
    if (totalSeconds <= 0) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(totalSeconds);
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = totalSeconds - elapsed;
      if (remaining <= 0) {
        setTimeLeft(0);
        if (!calledRef.current) {
          calledRef.current = true;
          onTimeUpRef.current();
        }
        window.clearInterval(intervalId);
        return;
      }
      setTimeLeft(remaining);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [totalSeconds, sessionKey]);

  if (timeLeft == null) {
    return { timeLeft: null, timerWarning: false, timerCritical: false };
  }
  return {
    timeLeft,
    timerWarning: timeLeft <= WARNING_THRESHOLD,
    timerCritical: timeLeft <= CRITICAL_THRESHOLD,
  };
}
