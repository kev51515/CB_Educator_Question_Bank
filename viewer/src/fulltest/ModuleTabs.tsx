/**
 * fulltest/ModuleTabs — the module-tab strip shared by Preview + Review.
 * Each tab shows the module label and its question count; the active tab is
 * filled. Horizontally scrollable when labels overflow.
 */
import type { TestContentModule } from "./testContent";

interface ModuleTabsProps {
  modules: TestContentModule[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function ModuleTabs({ modules, activeIndex, onSelect }: ModuleTabsProps): JSX.Element | null {
  if (modules.length === 0) return null;
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2" aria-label="Test modules">
      {modules.map((m, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={m.position}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={active ? "true" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              active
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {m.label}
            <span className={`ml-1.5 tabular-nums ${active ? "opacity-70" : "text-slate-400 dark:text-slate-500"}`}>
              {m.questions.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
