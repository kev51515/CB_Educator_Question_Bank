import { useState } from "react";
import type { ModuleNode } from "./useCourseModules";

interface MoveModulePickerProps {
  module: ModuleNode;
  flat: readonly ModuleNode[];
  descendantIds: ReadonlySet<string>;
  onApply: (newParentId: string | null, newPosition: number) => Promise<void>;
  onClose: () => void;
}

/** Picker for `move_module(p_module_id, p_new_parent_id, p_new_position)`. */
function MoveModulePicker({
  module,
  flat,
  descendantIds,
  onApply,
  onClose,
}: MoveModulePickerProps): JSX.Element {
  const [parentId, setParentId] = useState<string | null>(
    module.parent_module_id,
  );
  const [position, setPosition] = useState<number>(module.position);

  // Disallow self and any descendant as target (cycle prevention).
  const options = flat.filter(
    (m) => m.id !== module.id && !descendantIds.has(m.id),
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Move "{module.name}" to…
        </h3>
        <label className="block text-xs text-slate-500 dark:text-slate-400">
          New parent
          <select
            value={parentId ?? ""}
            onChange={(e) =>
              setParentId(e.target.value === "" ? null : e.target.value)
            }
            className="mt-1 w-full rounded-md bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="">Top level</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {"  ".repeat(m.depth)}
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
              void onApply(parentId, position);
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

export { MoveModulePicker };
export type { MoveModulePickerProps };
