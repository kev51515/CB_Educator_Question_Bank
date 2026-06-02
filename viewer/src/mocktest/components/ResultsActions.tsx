/**
 * ResultsActions — post-test action buttons (retake / close).
 *
 * The original SAT app also surfaced "practice weak skills" / "practice
 * missed" deeplinks via custom events. Those are out of scope here — the
 * CB viewer doesn't yet have the equivalent practice surface.
 */
interface ResultsActionsProps {
  onRetake: () => void;
  onClose: () => void;
}

export function ResultsActions({ onRetake, onClose }: ResultsActionsProps) {
  return (
    <div className="flex flex-wrap gap-3 pt-2 justify-center">
      <button
        type="button"
        onClick={onRetake}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
      >
        <span aria-hidden="true">↻</span>
        Take Another Test
      </button>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium"
      >
        <span aria-hidden="true">✕</span>
        Close
      </button>
    </div>
  );
}
