/**
 * DetailEmptyStates
 * =================
 * Empty / error / loading placeholders rendered by `Detail` when there is no
 * question to show:
 *
 *   - `DetailSetupPrompt`  — required filters are missing.
 *   - `DetailNoResults`    — filters applied but matched zero questions.
 *   - `DetailNoSelection`  — nothing loaded, no error, nothing selected.
 *   - `DetailLoadError`    — the data fetch failed.
 *   - `DetailSkeleton`     — loading shimmer.
 *
 * Each renders its own `<main>` wrapper so `Detail` can early-return them
 * verbatim. They are intentionally narrow components — pulling them out of
 * `Detail.tsx` keeps the orchestrator focused.
 */

const REQ_LABEL: { [k: string]: string } = {
  sections: "section",
  difficulties: "difficulty",
};

function requiredHeadline(missing: string[]): string {
  const ls = missing.map((k) => REQ_LABEL[k] ?? k);
  if (ls.length === 0) return "";
  if (ls.length === 1) return `Choose a ${ls[0]} to begin browsing questions.`;
  return `Choose a ${ls.slice(0, -1).join(", ")} and ${ls[ls.length - 1]} to begin.`;
}

interface DetailSetupPromptProps {
  /** Required filter keys still missing (e.g. ["sections", "difficulties"]). */
  missingRequired: string[];
}

export function DetailSetupPrompt({ missingRequired }: DetailSetupPromptProps) {
  return (
    <main className="flex-1 min-w-0 flex items-center justify-center p-10">
      <div className="max-w-sm text-center">
        <div className="w-12 h-12 rounded-full bg-accent-50 flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-accent-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-[16px] font-semibold text-ink-800 mb-1.5">
          {requiredHeadline(missingRequired)}
        </h2>
        <p className="text-[13px] text-ink-500 leading-relaxed">
          Pick filters in the sidebar — questions appear here as soon as you make a selection.
        </p>
      </div>
    </main>
  );
}

interface DetailNoResultsProps {
  /** Optional reset handler — when omitted, the "Reset all filters" button is hidden. */
  onReset?: () => void;
}

export function DetailNoResults({ onReset }: DetailNoResultsProps) {
  return (
    <main className="flex-1 min-w-0 flex items-center justify-center p-10">
      <div className="max-w-sm text-center">
        <div className="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-ink-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
        </div>
        <h2 className="text-[15px] font-semibold text-ink-800 mb-1.5">No questions match your filters</h2>
        <p className="text-[13px] text-ink-500 leading-relaxed mb-4">Try adjusting your search or filter criteria.</p>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 text-[13px] font-medium rounded-lg bg-accent-600 hover:bg-accent-700 text-white shadow-card hover:shadow-md transition-all duration-150 focus-ring"
          >
            Reset all filters
          </button>
        )}
      </div>
    </main>
  );
}

export function DetailNoSelection() {
  return (
    <main className="flex-1 min-w-0 flex items-center justify-center text-[13.5px] text-ink-400">
      Select a question to view it.
    </main>
  );
}

interface DetailLoadErrorProps {
  /** Error message to display below the headline. */
  error: string;
}

export function DetailLoadError({ error }: DetailLoadErrorProps) {
  return (
    <main className="flex-1 min-w-0 p-12 text-red-600">
      <p className="font-semibold">Failed to load question</p>
      <p className="text-sm mt-1 text-ink-500">{error}</p>
    </main>
  );
}

export function DetailSkeleton() {
  return (
    <main className="flex-1 min-w-0 p-12 animate-pulse">
      <div className="h-3 w-24 bg-ink-100 rounded mb-2" />
      <div className="h-3 w-2/3 bg-ink-100 rounded mb-10" />
      <div className="h-3 w-full bg-ink-100 rounded mb-2" />
      <div className="h-3 w-11/12 bg-ink-100 rounded mb-2" />
      <div className="h-3 w-10/12 bg-ink-100 rounded mb-10" />
      <div className="h-12 w-full bg-ink-100 rounded-xl mb-2" />
      <div className="h-12 w-full bg-ink-100 rounded-xl mb-2" />
      <div className="h-12 w-full bg-ink-100 rounded-xl mb-2" />
      <div className="h-12 w-full bg-ink-100 rounded-xl" />
    </main>
  );
}
