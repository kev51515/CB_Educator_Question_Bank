/**
 * TestTypeSelector — grid of source/test-type cards.
 *
 * Each option corresponds to a `TestSourceId` (`cb`, `sat`, `mixed`). Selection
 * is a single-pick radio-style grid.
 */
import type { TestSourceId } from "@/mocktest/types";

interface TestTypeOption {
  id: TestSourceId;
  label: string;
  description: string;
  icon: string;
}

interface TestTypeSelectorProps {
  options: TestTypeOption[];
  selected: TestSourceId | null;
  onSelect: (id: TestSourceId) => void;
}

export type { TestTypeOption };

export function TestTypeSelector({ options, selected, onSelect }: TestTypeSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((opt) => {
        const isSelected = selected === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            aria-pressed={isSelected}
            aria-label={`${opt.label}: ${opt.description}`}
            className={[
              "text-left rounded-xl border p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              isSelected
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-900/70",
            ].join(" ")}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none mt-0.5" aria-hidden="true">
                {opt.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {opt.label}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] px-1.5 py-0 shrink-0 rounded bg-indigo-600 text-white">
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-snug">{opt.description}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
