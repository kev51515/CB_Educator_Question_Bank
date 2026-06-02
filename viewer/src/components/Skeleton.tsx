interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "h-4 w-full rounded" }: SkeletonProps) {
  // M29: announce to SR users as "Loading" — the visual shimmer is decorative.
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className={`animate-pulse bg-slate-200 dark:bg-slate-800 ${className}`}
    />
  );
}

interface SkeletonRowsProps {
  count?: number;
  rowClassName?: string;
  gap?: number;
}

export function SkeletonRows({
  count = 5,
  rowClassName = "h-12",
  gap = 8,
}: SkeletonRowsProps) {
  // M29: parent container labelled so SR users hear "Loading content" once,
  // not once per shimmer row.
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="flex flex-col"
      style={{ gap: `${gap}px` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${rowClassName} rounded-lg`} />
      ))}
    </div>
  );
}

// Stable pseudo-random width between min% and max% so the skeleton looks
// alive but not jittery across renders.
function placeholderWidth(seed: number, min = 60, max = 95): string {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  const frac = x - Math.floor(x);
  const pct = Math.round(min + frac * (max - min));
  return `${pct}%`;
}

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className = "" }: SkeletonCardProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className={`rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4 ${className}`}
    >
      <Skeleton className="h-4 rounded" />
      <div className="mt-3 space-y-2">
        <div
          className="animate-pulse bg-slate-200 dark:bg-slate-800 h-3 rounded"
          style={{ width: placeholderWidth(1) }}
        />
        <div
          className="animate-pulse bg-slate-200 dark:bg-slate-800 h-3 rounded"
          style={{ width: placeholderWidth(2) }}
        />
      </div>
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className = "",
}: SkeletonTableProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className={`overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 ${className}`}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-900/60">
            {Array.from({ length: cols }).map((_, c) => (
              <th key={c} className="px-3 py-3 text-left">
                <div
                  className="animate-pulse bg-slate-200 dark:bg-slate-800 h-3 rounded"
                  style={{ width: placeholderWidth(c + 1, 50, 80) }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr
              key={r}
              className="border-t border-slate-100 dark:border-slate-800"
            >
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-3 py-3">
                  <div
                    className="animate-pulse bg-slate-200 dark:bg-slate-800 h-3 rounded"
                    style={{ width: placeholderWidth(r * cols + c + 3) }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
