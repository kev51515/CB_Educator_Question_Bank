import type { JSX } from "react";

/* ──────────────────────────── StatusFilter ────────────────────────────── */

interface StatusFilterProps {
  counts: { bookmarked: number; done: number; selected: number };
  value: string[];
  onChange: (next: string[]) => void;
}

export function StatusFilter({ counts, value, onChange }: StatusFilterProps): JSX.Element {
  const rows: { key: string; label: string; count: number; tone: string }[] = [
    { key: "bookmarked", label: "Bookmarked", count: counts.bookmarked, tone: "bg-amber-500" },
    { key: "done", label: "Done", count: counts.done, tone: "bg-emerald-500" },
    { key: "selected", label: "In print set", count: counts.selected, tone: "bg-accent-500" },
  ];
  const checked = new Set(value);
  const toggle = (key: string): void => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((r) => {
        const isChecked = checked.has(r.key);
        const isZero = r.count === 0 && !isChecked;
        return (
          <label
            key={r.key}
            className={
              "group flex items-center gap-2.5 px-2.5 py-1 rounded-md transition-colors select-none " +
              (isZero ? "cursor-default opacity-55" : "cursor-pointer hover:bg-ink-200/60")
            }
          >
            <span
              className={
                "relative inline-flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border transition-colors " +
                (isChecked
                  ? "bg-accent-600 border-accent-600"
                  : "bg-white border-ink-300 group-hover:border-ink-400")
              }
              aria-hidden
            >
              {isChecked && (
                <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
                </svg>
              )}
            </span>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggle(r.key)}
              disabled={isZero}
              className="sr-only"
              aria-label={r.label}
            />
            <span className={"inline-block w-1.5 h-1.5 rounded-full " + r.tone} aria-hidden />
            <span className={"flex-1 truncate text-[13px] " + (isChecked ? "text-ink-800" : "text-ink-700")}>
              {r.label}
            </span>
            <span className="tabular-nums text-[12px] text-ink-400 group-hover:text-ink-600">
              {r.count.toLocaleString()}
            </span>
          </label>
        );
      })}
    </div>
  );
}
