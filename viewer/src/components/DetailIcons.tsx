/**
 * DetailIcons
 * ===========
 * Header-bar primitives for `Detail`:
 *   - `IconButton`     — round-square toggle button used across the sticky
 *                         header (bookmark, done, copy link, etc).
 *   - `FontStepper`    — a±/a− pair for the body font-size step.
 *   - Inline SVG icons — Star, Check, Copy, Set, Note, Shuffle (filled +
 *                         outline variants where applicable).
 *
 * These were factored out of `Detail.tsx` to keep that file focused on
 * orchestration rather than primitive markup. Nothing here owns state.
 */
import type { ReactNode } from "react";

interface IconButtonProps {
  /** Click handler. */
  onClick: () => void;
  /** Title shown on hover and announced to AT (also used as `aria-label`). */
  title: string;
  /** Whether the button is currently in its "active" toggled state. */
  active?: boolean;
  /** Color theme used when `active` — defaults to a neutral ink tint. */
  activeColor?: "amber" | "emerald" | "accent";
  /** Icon (or any node) rendered inside the 28×28 button. */
  children: ReactNode;
}

export function IconButton({
  onClick,
  title,
  active = false,
  activeColor,
  children,
}: IconButtonProps) {
  const activeCls =
    active && activeColor === "amber"
      ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
      : active && activeColor === "emerald"
        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        : active && activeColor === "accent"
          ? "bg-accent-50 text-accent-700 hover:bg-accent-100"
          : active
            ? "bg-ink-100 text-ink-800"
            : "text-ink-500 hover:text-ink-800 hover:bg-ink-100";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-tooltip={title}
      className={
        "w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors focus-ring " +
        activeCls
      }
    >
      {children}
    </button>
  );
}

interface FontStepperProps {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}

export function FontStepper({ value, onChange, min, max }: FontStepperProps) {
  return (
    <div className="inline-flex items-stretch rounded-md overflow-hidden border border-ink-200">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        title="Smaller text (−)"
        aria-label="Smaller text"
        className="w-7 h-7 text-[12px] text-ink-600 hover:bg-ink-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
      >
        A−
      </button>
      <span className="w-px bg-ink-200" aria-hidden />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        title="Larger text (+)"
        aria-label="Larger text"
        className="w-7 h-7 text-[13px] text-ink-600 hover:bg-ink-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
      >
        A+
      </button>
    </div>
  );
}

export const iconCls = "w-3.5 h-3.5";

export function StarOutline() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
export function StarFilled() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="currentColor" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
export function CheckOutline() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
export function CheckFilled() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
export function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
export function SetOutline() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <line x1="3" y1="11" x2="21" y2="11" />
    </svg>
  );
}
export function SetFilled() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="currentColor" aria-hidden>
      <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Zm0 5h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" />
    </svg>
  );
}
export function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4h12l4 4v12a0 0 0 0 1 0 0H4a0 0 0 0 1 0 0V4Z" />
      <polyline points="16 4 16 8 20 8" />
    </svg>
  );
}
export function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}
