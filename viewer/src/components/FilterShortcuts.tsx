import { useCallback, useEffect, useRef } from "react";
import { filtersEqual, type Filters } from "@/types";

/* ─── Filter undo history ──────────────────────────────────────────────────── */

const MAX_HISTORY = 20;

export function useFilterHistory(filters: Filters): {
  history: Filters[];
  canUndo: boolean;
  undo: () => Filters | null;
} {
  const historyRef = useRef<Filters[]>([]);
  const prevRef = useRef<Filters>(filters);

  // When filters change, push the *previous* value onto the stack.
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = filters;
    if (filtersEqual(prev, filters)) return;
    historyRef.current = [...historyRef.current, prev].slice(-MAX_HISTORY);
  }, [filters]);

  const undo = useCallback((): Filters | null => {
    if (historyRef.current.length === 0) return null;
    const last = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    // Update prevRef so the undo itself doesn't push onto the stack.
    prevRef.current = last;
    return last;
  }, []);

  return {
    history: historyRef.current,
    canUndo: historyRef.current.length > 0,
    undo,
  };
}

/* ─── Keyboard filter shortcuts hook ───────────────────────────────────────── */

/** Case-insensitive toggle – same logic as Sidebar. */
function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  const low = value.toLowerCase();
  let removed = false;
  for (const v of next) {
    if (v.toLowerCase() === low) {
      next.delete(v);
      removed = true;
      break;
    }
  }
  if (!removed) next.add(value);
  return next;
}

interface FilterShortcutConfig {
  filters: Filters;
  onChange: (f: Filters) => void;
  filterHistory: Filters[];
  onUndo: () => void;
}

export function useFilterShortcuts(config: FilterShortcutConfig): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        !!t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (inField) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const { filters, onChange, onUndo } = configRef.current;

      // Shift+Z → undo last filter change
      if (e.shiftKey && e.key === "Z") {
        e.preventDefault();
        onUndo();
        return;
      }

      // Shift+M → toggle Math section
      if (e.shiftKey && e.key === "M") {
        e.preventDefault();
        onChange({ ...filters, sections: toggle(filters.sections, "Math") });
        return;
      }

      // Shift+R → toggle "Reading and Writing" section
      if (e.shiftKey && e.key === "R") {
        e.preventDefault();
        onChange({
          ...filters,
          sections: toggle(filters.sections, "Reading and Writing"),
        });
        return;
      }

      // 1/2/3 → toggle Easy/Medium/Hard (only unshifted, no modifier)
      if (e.shiftKey) return;

      if (e.key === "1") {
        e.preventDefault();
        onChange({ ...filters, difficulties: toggle(filters.difficulties, "Easy") });
      } else if (e.key === "2") {
        e.preventDefault();
        onChange({
          ...filters,
          difficulties: toggle(filters.difficulties, "Medium"),
        });
      } else if (e.key === "3") {
        e.preventDefault();
        onChange({ ...filters, difficulties: toggle(filters.difficulties, "Hard") });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/* ─── UndoChip ─────────────────────────────────────────────────────────────── */

interface UndoChipProps {
  canUndo: boolean;
  onUndo: () => void;
}

export function UndoChip({ canUndo, onUndo }: UndoChipProps): JSX.Element | null {
  if (!canUndo) return null;
  return (
    <button
      type="button"
      onClick={onUndo}
      className="text-[10.5px] text-accent-600 hover:text-accent-700 cursor-pointer focus-ring rounded px-1.5 py-0.5"
    >
      &larr; Undo
    </button>
  );
}
