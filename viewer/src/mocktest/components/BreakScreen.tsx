/**
 * BreakScreen — shown while questions are loading (or as a generic pause).
 *
 * The original SAT app shows this between sections of the adaptive test.
 * On first pass we use it only as a loading-state screen; the orchestrator
 * doesn't split the test into modules.
 */
interface BreakScreenProps {
  title?: string;
  message?: string;
  onContinue?: () => void;
}

export function BreakScreen({
  title = "Loading…",
  message = "Preparing your test.",
  onContinue,
}: BreakScreenProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex items-center justify-center">
          <div
            className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-300 text-2xl"
            aria-hidden="true"
          >
            ⏳
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="text-slate-500 text-sm">{message}</p>
        </div>
        {onContinue && (
          <button
            type="button"
            onClick={onContinue}
            className="w-full h-11 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
