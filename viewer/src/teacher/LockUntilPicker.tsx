import { useState } from "react";
import { SmartDatePicker } from "@/components";

interface LockUntilPickerProps {
  initial: string | null;
  onApply: (iso: string | null) => Promise<void>;
  onClose: () => void;
}

/** Tiny modal-ish popover for setting `course_modules.lock_at`. */
function LockUntilPicker({
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

export { LockUntilPicker };
export type { LockUntilPickerProps };
