/**
 * QuickBuildPreviewStep
 * =====================
 * Second step of the Quick Build wizard. Shows the random sample of questions
 * the user is about to add to the print set, with three actions:
 *
 *   - Back    → return to the configure step
 *   - Shuffle → re-pick a fresh random sample from the same pool
 *   - Add     → commit the preview to the print set
 *
 * Pure presentation: receives the resolved entries from the parent wizard,
 * which owns the matching pool and sampling logic.
 *
 * Co-located with QuickBuild — not re-exported from the components barrel so
 * it stays inside the lazy chunk.
 */
import type { IndexEntry } from "@/types";

interface QuickBuildPreviewStepProps {
  /** Sampled questions to preview, in display order. */
  entries: IndexEntry[];
  /** Re-roll the sample with the current filters. */
  onShuffle: () => void;
  /** Commit the current sample to the print set. */
  onAdd: () => void;
  /** Return to the configure step. */
  onBack: () => void;
}

export function QuickBuildPreviewStep({
  entries,
  onShuffle,
  onAdd,
  onBack,
}: QuickBuildPreviewStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-[12.5px] text-ink-500 hover:text-ink-700 transition-colors focus-ring flex items-center gap-1"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span className="text-[12.5px] text-ink-500 tabular-nums">
          {entries.length} question{entries.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Scrollable preview list */}
      <div className="max-h-60 overflow-y-auto thin-scrollbar rounded-xl border border-ink-100 divide-y divide-ink-50">
        {entries.map((e) => (
          <div
            key={e.id}
            className="px-3 py-2 flex items-center gap-3 text-[12.5px]"
          >
            <span className="tabular-nums font-semibold text-ink-700 shrink-0 w-10 text-right">
              {e.number != null ? `#${e.number}` : "—"}
            </span>
            <span className="flex-1 text-ink-600 truncate">{e.skill}</span>
            <span className="text-[11px] text-ink-400 shrink-0">{e.difficulty}</span>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-ink-400">
            No questions selected
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onShuffle}
          className="px-4 py-2 rounded-lg border border-ink-200 text-ink-600 text-[13px] font-medium hover:bg-ink-50 transition-colors focus-ring"
        >
          Shuffle
        </button>
        <button
          type="button"
          onClick={onAdd}
          disabled={entries.length === 0}
          className="flex-1 px-4 py-2 rounded-lg bg-accent-600 text-white text-[13px] font-medium hover:bg-accent-700 transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add to print set
        </button>
      </div>
    </div>
  );
}
