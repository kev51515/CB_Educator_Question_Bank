import { Skeleton } from "../components/Skeleton";

interface StatCardProps {
  label: string;
  /** `null` while loading; "—" when unavailable; otherwise a formatted string. */
  value: string | null;
  /** Optional caption beneath the value. */
  hint?: string;
  loading: boolean;
  onClick?: () => void;
  ariaLabel: string;
}

export function StatCard({
  label,
  value,
  hint,
  loading,
  onClick,
  ariaLabel,
}: StatCardProps): JSX.Element {
  const baseClass =
    "rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/85 dark:bg-slate-900/70 p-4 min-h-[88px] flex flex-col justify-center motion-safe:transition-all";
  const interactiveClass = onClick
    ? "text-left w-full min-h-[88px] hover:ring-indigo-300 dark:hover:ring-indigo-700 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
    : "";

  const content = (
    <>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
        {label}
      </p>
      {loading || value === null ? (
        <Skeleton className="h-8 w-16 mt-1 rounded" />
      ) : (
        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
          {value}
        </p>
      )}
      {hint && !loading && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          {hint}
        </p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} ${interactiveClass}`}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={baseClass}
      role="group"
      aria-label={ariaLabel}
    >
      {content}
    </div>
  );
}
