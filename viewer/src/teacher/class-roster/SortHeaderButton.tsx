/**
 * class-roster/SortHeaderButton
 * =============================
 * Sortable column header button (active arrow + aria-sort). Extracted verbatim
 * from ClassRoster.
 */
import { type SortDir, type SortKey } from "./helpers";
export interface SortHeaderButtonProps {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}

export function SortHeaderButton({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: SortHeaderButtonProps): JSX.Element {
  const ariaSort: "ascending" | "descending" | "none" = active
    ? dir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const indicator = active ? (
    <span
      aria-hidden
      className="ml-1 inline-block text-indigo-600 dark:text-indigo-400"
    >
      {dir === "asc" ? "▲" : "▼"}
    </span>
  ) : (
    <span
      aria-hidden
      className="ml-1 inline-block text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 motion-safe:transition-opacity"
    >
      ↕
    </span>
  );
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSort(sortKey);
        }
      }}
      aria-sort={ariaSort}
      aria-label={
        active
          ? `Sorted by ${label}, ${
              dir === "asc" ? "ascending" : "descending"
            }. Click to reverse.`
          : `Sort by ${label}`
      }
      className={`group inline-flex items-center min-h-[40px] -my-2 px-1 -mx-1 rounded-md text-xs uppercase tracking-wide font-medium motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        active
          ? "text-indigo-700 dark:text-indigo-300"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {label}
      {indicator}
    </button>
  );
}

// Debounce a value by `delay` ms. Inlined here (vs. shared hook) so the
// roster + gradebook can ship search independently without ripple.
