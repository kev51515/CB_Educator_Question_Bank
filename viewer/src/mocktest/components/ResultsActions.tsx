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
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
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
