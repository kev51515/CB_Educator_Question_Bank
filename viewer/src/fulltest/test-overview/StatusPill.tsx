/**
 * test-overview/StatusPill + RowAction + ActionGroup
 * ==================================================
 * Shared roster-row primitives for the live test monitor.
 *
 * The roster used to render every state as a differently-coloured *outlined*
 * pill and every action as a differently-coloured *outlined* button, so each
 * row read as a wall of competing borders. These three primitives collapse
 * that into one calm visual language:
 *   • StatusPill — one pill family (tinted fill + leading dot, optional live
 *     pulse) for every status/signal, so colour alone carries the state.
 *   • RowAction  — one ghost button (no ring; hover tint) so actions stay
 *     visually subordinate to the row content. Semantic tone (warn/danger)
 *     survives in the text colour without shouting.
 *   • ActionGroup — segmented container that collects the live-control trio
 *     (Pause · End · Reset) into a single control instead of three floaters.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

type PillTone = "idle" | "live" | "paused" | "released" | "hidden" | "alert" | "warn";

const PILL: Record<PillTone, { wrap: string; dot: string }> = {
  idle: {
    wrap: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
  live: {
    wrap: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  paused: {
    wrap: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  released: {
    wrap: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  hidden: {
    wrap: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
  alert: {
    wrap: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  warn: {
    wrap: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    dot: "bg-amber-500",
  },
};

export function StatusPill({
  tone,
  label,
  pulse = false,
  icon,
  title,
}: {
  tone: PillTone;
  label: string;
  pulse?: boolean;
  /** When set, replaces the leading dot with a custom node (e.g. an SVG icon). */
  icon?: ReactNode;
  title?: string;
}): JSX.Element {
  const t = PILL[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${t.wrap}`}
    >
      {icon != null ? (
        <span aria-hidden className="text-[11px] leading-none">
          {icon}
        </span>
      ) : (
        <span aria-hidden className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${t.dot}`}
            />
          )}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${t.dot}`} />
        </span>
      )}
      {label}
    </span>
  );
}

type ActionTone = "neutral" | "primary" | "warn" | "danger";

const ACTION: Record<ActionTone, string> = {
  neutral:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100",
  primary:
    "text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/50",
  warn: "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/50",
  danger:
    "text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/50",
};

export function RowAction({
  tone = "neutral",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ActionTone }): JSX.Element {
  return (
    <button
      type="button"
      className={`inline-flex min-h-[32px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50 ${ACTION[tone]} ${className}`}
      {...rest}
    />
  );
}

/** Segmented container for the live-control trio. Children should be
 *  `<RowAction className="rounded-none" />` so the group owns the rounding. */
export function ActionGroup({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="inline-flex items-center divide-x divide-slate-200 overflow-hidden rounded-lg ring-1 ring-slate-200 dark:divide-slate-700 dark:ring-slate-700">
      {children}
    </div>
  );
}
