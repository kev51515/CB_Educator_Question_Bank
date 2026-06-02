/**
 * BulkActionsBar
 * ==============
 * Sticky bottom bar shown when the teacher has multi-selected one or more
 * assignments on the Assignments page.
 *
 * Renders the "N selected" count + Archive all / Unarchive all / Delete
 * buttons + a Clear-selection link. The parent owns the underlying state
 * (selected ids, busy flag) and passes callbacks for each action.
 *
 * Extracted from AssignmentsPage.tsx — behavior-preserving.
 *
 * The destructive Delete button only opens the confirm dialog; the actual
 * delete RPC lives on the page so it can re-use the page's refresh + toast
 * wiring.
 */
export interface BulkActionsBarProps {
  selectedCount: number;
  busy: boolean;
  onArchiveAll: () => void;
  onUnarchiveAll: () => void;
  onRequestDelete: () => void;
  onClear: () => void;
}

export function BulkActionsBar({
  selectedCount,
  busy,
  onArchiveAll,
  onUnarchiveAll,
  onRequestDelete,
  onClear,
}: BulkActionsBarProps): JSX.Element {
  return (
    <div
      role="region"
      aria-label="Bulk assignment actions"
      className="fixed bottom-4 left-0 right-0 z-50 px-3 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-700 shadow-xl px-4 py-2.5 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {selectedCount} selected
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={onArchiveAll}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Working…" : "Archive all"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onUnarchiveAll}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Unarchive all
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRequestDelete}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="ml-auto text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
