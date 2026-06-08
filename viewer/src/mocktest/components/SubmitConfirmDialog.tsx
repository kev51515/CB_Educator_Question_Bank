/**
 * SubmitConfirmDialog — modal overlay asking the user to confirm test submit.
 *
 * Shows answered/unanswered/flagged counts. Closing via Escape is handled by
 * the parent (TestPhase) keydown listener.
 */
interface SubmitConfirmDialogProps {
  answeredCount: number;
  unansweredCount: number;
  flaggedCount: number;
  total: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SubmitConfirmDialog({
  answeredCount,
  unansweredCount,
  flaggedCount,
  total,
  onConfirm,
  onCancel,
}: SubmitConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-submit-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="text-amber-700 dark:text-amber-300 leading-none" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </span>
          <div>
            <h2
              id="confirm-submit-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Submit Test?
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              You cannot change answers after submitting.
            </p>
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg px-4 py-3 flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Answered</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {answeredCount} / {total}
            </span>
          </div>
          {unansweredCount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Unanswered</span>
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {unansweredCount}
              </span>
            </div>
          )}
          {flaggedCount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Flagged for review</span>
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {flaggedCount}
              </span>
            </div>
          )}
        </div>
        {unansweredCount > 0 && (
          <p className="text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            {unansweredCount} question{unansweredCount !== 1 ? "s" : ""} still unanswered.
          </p>
        )}
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-md bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
          >
            Confirm Submit
          </button>
        </div>
      </div>
    </div>
  );
}
