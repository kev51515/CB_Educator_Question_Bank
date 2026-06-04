/**
 * test-overview/InterventionModal
 * ===============================
 * Confirmation modal for proctor interventions (End now / locked Reset that
 * requires typing the student name). Extracted verbatim from TestOverviewPage.
 */
import { useRef } from "react";
import { useEscapeKey, useFocusTrap } from "@/hooks";
import { type RosterRow } from "./helpers";
export interface InterventionModalProps {
  action: { kind: "end" | "reset"; row: RosterRow; runId?: string };
  text: string;
  onText: (v: string) => void;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function InterventionModal({
  action,
  text,
  onText,
  busy,
  onConfirm,
  onCancel,
}: InterventionModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  useEscapeKey(() => {
    if (!busy) onCancel();
  });
  const isReset = action.kind === "reset";
  const name = action.row.student_name ?? "Student";
  const canConfirm = !isReset || text.trim() === name.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intervention-title"
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="intervention-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {isReset ? `Reset ${name}'s attempt?` : `End ${name}'s test now?`}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isReset
            ? "This permanently discards their current attempt so they can start over from the beginning — any answers they've entered are lost. This can't be undone."
            : "Their test is submitted immediately and graded on whatever they've answered so far. Questions they didn't reach count as incorrect."}
        </p>
        {isReset && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Type <span className="font-semibold text-slate-900 dark:text-slate-100">{name}</span>{" "}
              to confirm
            </span>
            <input
              data-autofocus
              value={text}
              onChange={(e) => onText(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              placeholder={name}
            />
          </label>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed ${
              isReset ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {busy ? "Working…" : isReset ? "Reset attempt" : "End test"}
          </button>
        </div>
      </div>
    </div>
  );
}
