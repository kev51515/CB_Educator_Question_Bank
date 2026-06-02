import { useState } from "react";
import type { CourseModule, ModuleItem } from "./useCourseModules";

interface MoveItemPickerProps {
  item: ModuleItem;
  modules: readonly CourseModule[];
  onApply: (targetModuleId: string, position: number) => Promise<void>;
  onClose: () => void;
}

/** Tiny picker for `move_item_to_module(p_item_id, p_target_module_id, p_position)`. */
function MoveItemPicker({
  item,
  modules,
  onApply,
  onClose,
}: MoveItemPickerProps): JSX.Element {
  const [targetModuleId, setTargetModuleId] = useState<string>(item.module_id);
  const [position, setPosition] = useState<number>(item.position);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Move "{item.title}" to…
        </h3>
        <label className="block text-xs text-slate-500 dark:text-slate-400">
          Target module
          <select
            value={targetModuleId}
            onChange={(e) => setTargetModuleId(e.target.value)}
            className="mt-1 w-full rounded-md bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500 dark:text-slate-400">
          Position (0-based)
          <input
            type="number"
            min={0}
            value={position}
            onChange={(e) => setPosition(Number.parseInt(e.target.value, 10) || 0)}
            className="mt-1 w-full rounded-md bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
          />
        </label>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void onApply(targetModuleId, position);
            }}
            className="rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}

export { MoveItemPicker };
export type { MoveItemPickerProps };
