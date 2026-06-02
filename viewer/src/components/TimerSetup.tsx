/**
 * TimerSetup modal — extracted from TimerSession.tsx so it can be lazy-loaded
 * effectively. TimerSession (TimerBar) is statically imported via the barrel,
 * which would otherwise pin this modal into the main chunk (Rollup
 * INEFFECTIVE_DYNAMIC_IMPORT). Lazy-loaded via `LazyTimerSetup` in lazy.ts.
 */
import { useEffect, useRef, useState } from "react";
import { IDENTITY } from "../lib/designTokens";
import { useFocusTrap } from "../hooks";

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
