/**
 * test-overview/StatCard
 * ======================
 * Small labelled stat tile used in the overview header. Extracted verbatim
 * from TestOverviewPage.
 */
import { Skeleton } from "@/components/Skeleton";
export function StatCard({
  label,
  value,
  loading = false,
  sub,
  suffix,
  tone = "slate",
  ceremonial = false,
}: {
  label: string;
  value: number | null;
  loading?: boolean;
  sub?: string;
  suffix?: string;
  tone?: "slate" | "indigo" | "emerald" | "blue" | "muted";
  /** Ivy-theme accent for the one flagship numeral on screen; no-op in classic. */
  ceremonial?: boolean;
}): JSX.Element {
  const toneCls: Record<string, string> = {
    slate: "text-slate-900 dark:text-slate-100",
    indigo: "text-indigo-600 dark:text-indigo-300",
    emerald: "text-emerald-600 dark:text-emerald-300",
    blue: "text-blue-600 dark:text-blue-300",
    muted: "text-slate-400 dark:text-slate-500",
  };
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1.5 h-8 w-16 rounded" />
      ) : value === null ? (
        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-300 dark:text-slate-600">—</p>
      ) : (
        <p className={`mt-1 text-3xl font-bold tabular-nums ${ceremonial ? "ceremonial " : ""}${toneCls[tone]}`}>
          {value}
          {suffix && <span className="text-lg font-semibold">{suffix}</span>}
        </p>
      )}
      {sub && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}
