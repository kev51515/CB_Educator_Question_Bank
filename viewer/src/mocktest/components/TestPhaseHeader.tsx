/**
 * TestPhaseHeader — top bar showing the test label, countdown, and question
 * counter. When `timeLeftSeconds` is null the test is untimed and the timer
 * pill is hidden.
 *
 * Accessibility (B3): the visible pill is silent to screen readers
 * (aria-hidden) and a sibling hidden live region announces only at
 * meaningful thresholds (5 min / 1 min / 30 s) so an SR student under
 * extended time hears warnings without being flooded every second.
 */
import { useEffect, useRef, useState } from "react";

interface TestPhaseHeaderProps {
  label: string;
  timeLeftSeconds: number | null;
  timerWarning: boolean;
  timerCritical: boolean;
  currentIdx: number;
  total: number;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

// Threshold-cross announcements (in seconds remaining).
const THRESHOLDS: readonly { at: number; message: string }[] = [
  { at: 600, message: "10 minutes remaining" },
  { at: 300, message: "5 minutes remaining" },
  { at: 60, message: "1 minute remaining" },
  { at: 30, message: "30 seconds remaining" },
  { at: 10, message: "10 seconds remaining" },
];

export function TestPhaseHeader({
  label,
  timeLeftSeconds,
  timerWarning,
  timerCritical,
  currentIdx,
  total,
}: TestPhaseHeaderProps) {
  // Compute threshold-cross announcements. Compare against previous tick so
  // each threshold fires exactly once and we don't spam the SR every second.
  const prevSecondsRef = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");

  useEffect(() => {
    if (timeLeftSeconds == null) {
      prevSecondsRef.current = null;
      return;
    }
    const prev = prevSecondsRef.current;
    if (prev != null) {
      for (const t of THRESHOLDS) {
        if (prev > t.at && timeLeftSeconds <= t.at) {
          setAnnouncement(t.message);
          break;
        }
      }
    }
    prevSecondsRef.current = timeLeftSeconds;
  }, [timeLeftSeconds]);

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm shrink-0 z-10">
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
        {label}
      </span>
      {timeLeftSeconds != null && (
        <>
          <div
            className={[
              "flex items-center gap-1.5 font-mono text-sm font-bold px-3 py-1 rounded-full border transition-colors",
              timerCritical
                ? "text-rose-700 dark:text-rose-300 border-rose-400 bg-rose-50 dark:bg-rose-950/40 animate-pulse"
                : timerWarning
                  ? "text-amber-700 dark:text-amber-300 border-amber-400 bg-amber-50 dark:bg-amber-950/40"
                  : "text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40",
            ].join(" ")}
            aria-hidden="true"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2 2" />
              <path d="M5 3 2 6" />
              <path d="m22 6-3-3" />
            </svg>
            <span>{formatTime(timeLeftSeconds)}</span>
          </div>
          {/*
            Hidden live region for SR users. Only changes at thresholds, so
            it announces "5 minutes remaining" / "1 minute remaining" / etc.
            once each — not every second.
          */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {announcement}
          </div>
        </>
      )}
      <span className="text-xs text-slate-500 whitespace-nowrap">
        Q {currentIdx + 1} <span className="opacity-50">of</span> {total}
      </span>
    </header>
  );
}
