/**
 * ModuleBreakdownTable — a small fact strip with high-level test metadata.
 *
 * On first pass the test isn't split into modules, so this simply surfaces
 * the duration and source mix.
 */
import { formatDuration } from "./resultsHelpers";

interface ModuleBreakdownTableProps {
  durationSeconds: number;
  totalQuestions: number;
  cbCount: number;
  satCount: number;
}

export function ModuleBreakdownTable({
  durationSeconds,
  totalQuestions,
  cbCount,
  satCount,
}: ModuleBreakdownTableProps) {
  const items: { label: string; value: string }[] = [
    { label: "Total questions", value: String(totalQuestions) },
    { label: "Total time", value: formatDuration(durationSeconds) },
  ];
  if (cbCount > 0) items.push({ label: "CB questions", value: String(cbCount) });
  if (satCount > 0) items.push({ label: "SAT questions", value: String(satCount) });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Summary</p>
      <ul className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-2">
            <span className="text-slate-500">{item.label}</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
