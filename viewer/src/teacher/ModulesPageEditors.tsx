/**
 * ModulesPageEditors
 * ==================
 * Inline-editing UI for the Modules page — click-to-rename and the small
 * lock/move picker popovers. Extracted verbatim from ModulesPage (modularization
 * step 4). Each is self-contained: it takes its data + an async `onApply`/`onSave`
 * callback via props and owns only local draft state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SmartDatePicker } from "@/components";
import type { CourseModule, ModuleItem, ModuleNode } from "./useCourseModules";

interface InlineRenameProps {
  value: string;
  disabled: boolean;
  onSave: (next: string) => Promise<void>;
  className?: string;
  titleClassName?: string;
}

/**
 * Click-to-edit text field. Enter / blur save, Esc cancels. Empty values
 * collapse back to the original value to avoid accidental clears.
 */
export function InlineRename({
  value,
  disabled,
  onSave,
  className,
  titleClassName,
}: InlineRenameProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(async (): Promise<void> => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    try {
      await onSave(trimmed);
      // Only close on success; throws keep the input open with the user's
      // typed value so they can retry instead of losing it.
      setEditing(false);
    } catch {
      // Keep editing=true; the parent handler already toasted.
    }
  }, [draft, onSave, value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={() => {
          void commit();
        }}
        className={`bg-white dark:bg-slate-800 ring-1 ring-indigo-400 rounded-md px-2 py-0.5 text-sm w-full max-w-md ${
          className ?? ""
        }`}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        setEditing(true);
      }}
      className={`group inline-flex items-center gap-1 min-w-0 text-left ${
        disabled ? "cursor-default" : "cursor-text"
      } ${className ?? ""}`}
    >
      <span className={`truncate ${titleClassName ?? ""}`}>{value}</span>
      {!disabled && (
        <svg
          width={12}
          height={12}
          viewBox="0 0 16 16"
          aria-hidden
          className="opacity-60 group-hover:opacity-100 transition text-slate-400 flex-none"
        >
          <path
            fill="currentColor"
            d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-1.66 1.66l-3.56-3.56l1.66-1.66Zm-2.6 2.6L2.158 10.28a1.75 1.75 0 0 0-.479.864l-.7 2.91a.75.75 0 0 0 .907.907l2.91-.7a1.75 1.75 0 0 0 .864-.479l6.254-6.254l-3.56-3.56Z"
          />
        </svg>
      )}
    </button>
  );
}

interface LockUntilPickerProps {
  initial: string | null;
  onApply: (iso: string | null) => Promise<void>;
  onClose: () => void;
}

/** Tiny modal-ish popover for setting `course_modules.lock_at`. */
export function LockUntilPicker({
  initial,
  onApply,
  onClose,
}: LockUntilPickerProps): JSX.Element {
  const [value, setValue] = useState<string | null>(initial);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Lock module until…
        </h3>
        <SmartDatePicker value={value} onChange={setValue} allowClear />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              void onApply(null);
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Clear lock
          </button>
          <div className="flex items-center gap-2">
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
                void onApply(value);
              }}
              className="rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MoveItemPickerProps {
  item: ModuleItem;
  modules: readonly CourseModule[];
  onApply: (targetModuleId: string, position: number) => Promise<void>;
  onClose: () => void;
}

/** Tiny picker for `move_item_to_module(p_item_id, p_target_module_id, p_position)`. */
export function MoveItemPicker({
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

interface MoveModulePickerProps {
  module: ModuleNode;
  flat: readonly ModuleNode[];
  descendantIds: ReadonlySet<string>;
  onApply: (newParentId: string | null, newPosition: number) => Promise<void>;
  onClose: () => void;
}

/** Picker for `move_module(p_module_id, p_new_parent_id, p_new_position)`. */
export function MoveModulePicker({
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
