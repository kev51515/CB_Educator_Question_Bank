import { RowChevron } from "./needsAttentionIcons";

// ─── Row primitives ───────────────────────────────────────────────────────

interface RowProps {
  initial: string;
  message: React.ReactNode;
  meta: string;
  onClick: () => void;
  ariaLabel: string;
  /** True when this row was just added via realtime — show a brief flash. */
  fresh?: boolean;
}

export function AttentionRow({ initial, message, meta, onClick, ariaLabel, fresh }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={
        "w-full flex items-center gap-3 px-3 py-2.5 min-h-[40px] rounded-lg " +
        "bg-white/70 dark:bg-slate-900/40 " +
        "ring-1 ring-slate-200/60 dark:ring-slate-800 " +
        "hover:bg-white hover:ring-indigo-200 " +
        "dark:hover:bg-slate-900 dark:hover:ring-indigo-800 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
        "transition-colors text-left " +
        (fresh
          ? "ring-2 ring-indigo-400 motion-safe:animate-pulse bg-indigo-50/50 dark:bg-indigo-950/30"
          : "")
      }
    >
      <span
        aria-hidden
        className="
          shrink-0 inline-flex items-center justify-center
          w-8 h-8 rounded-full text-xs font-semibold
          bg-indigo-100 text-indigo-700
          dark:bg-indigo-900/60 dark:text-indigo-200
        "
      >
        {initial}
      </span>
      <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
        {message}
      </span>
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
        {meta}
      </span>
      <RowChevron />
    </button>
  );
}
