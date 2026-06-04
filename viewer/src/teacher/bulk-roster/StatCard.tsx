/**
 * bulk-roster/StatCard
 * ====================
 * Small labelled count tile shown in the import summary. Extracted verbatim
 * from BulkRosterModal.
 */
export interface StatCardProps {
  label: string;
  count: number;
  tone: "emerald" | "slate" | "amber" | "rose";
}

export function StatCard({ label, count, tone }: StatCardProps) {
  const toneClasses: Record<StatCardProps["tone"], string> = {
    emerald:
      "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-900",
    slate:
      "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700",
    amber:
      "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 ring-amber-200 dark:ring-amber-900",
    rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 ring-rose-200 dark:ring-rose-900",
  };
  return (
    <div
      className={`rounded-lg ring-1 px-3 py-2 ${toneClasses[tone]}`}
      aria-label={`${label}: ${count}`}
    >
      <p className="text-[10px] uppercase tracking-wide font-semibold opacity-75">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{count}</p>
    </div>
  );
}
