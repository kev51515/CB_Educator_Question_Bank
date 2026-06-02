/**
 * BulkGradeModal
 * ==============
 * Apply a single feedback template (+ optional score override + mark-as-graded)
 * to a batch of assignment_attempts in one server round-trip.
 *
 * The teacher's pain point: writing "you missed the first 3 because…" twelve
 * times. This modal lets them write it once and broadcast.
 *
 * Behaviour:
 *  - Feedback (MarkdownEditor) and an optional Score override (0–100).
 *  - "Mark as graded" checkbox (default on) — stamps graded_at + grader_id.
 *  - Apply button is disabled until either feedback or score is provided.
 *  - Submit issues a single `.update().in("id", ids)` UPDATE.
 *  - Optimistic UI is owned by the parent (graying selected rows); this modal
 *    just resolves with the patch + ids and lets the page do the rest.
 *
 * Anti-foot-gun:
 *  - Warns inline if feedback HTML exceeds 5,000 chars.
 *  - Warns inline if any selected attempts are already graded — their existing
 *    feedback will be replaced.
 *
 * Accessibility: role=dialog, aria-modal, focus trap, Esc-to-close, visible
 * focus rings, ≥40px tap targets.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useFocusTrap } from "../hooks";

const MAX_RECOMMENDED_FEEDBACK_CHARS = 5000;

export interface BulkGradePatch {
  feedback_text?: string;
  score_override?: number;
  graded_at?: string;
}

export interface BulkGradeModalProps {
  selectedIds: string[];
  alreadyGradedCount: number;
  busy: boolean;
  onClose: () => void;
  onApply: (patch: BulkGradePatch) => void | Promise<void>;
}

export function BulkGradeModal({
  selectedIds,
  alreadyGradedCount,
  busy,
  onClose,
  onApply,
}: BulkGradeModalProps): JSX.Element {
  const [feedbackHtml, setFeedbackHtml] = useState<string>("");
  const [scoreRaw, setScoreRaw] = useState<string>("");
  const [markAsGraded, setMarkAsGraded] = useState<boolean>(true);

  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const feedbackTrimmed = feedbackHtml.trim();
  const feedbackPresent =
    feedbackTrimmed.length > 0 &&
    // TipTap renders an "empty" doc as <p></p>. Treat that as empty.
    feedbackTrimmed !== "<p></p>";

  const scoreNumber = useMemo<number | null>(() => {
    const trimmed = scoreRaw.trim();
    if (trimmed.length === 0) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return n;
  }, [scoreRaw]);

  const scoreInvalid =
    scoreRaw.trim().length > 0 &&
    (scoreNumber === null || scoreNumber < 0 || scoreNumber > 100);

  const feedbackTooLong = feedbackHtml.length > MAX_RECOMMENDED_FEEDBACK_CHARS;

  const canApply =
    selectedIds.length > 0 &&
    !busy &&
    !scoreInvalid &&
    (feedbackPresent || (scoreNumber !== null && !scoreInvalid));

  const handleApply = (): void => {
    if (!canApply) return;
    const patch: BulkGradePatch = {};
    if (feedbackPresent) patch.feedback_text = feedbackHtml;
    if (scoreNumber !== null && !scoreInvalid) patch.score_override = scoreNumber;
    if (markAsGraded) patch.graded_at = new Date().toISOString();
    void onApply(patch);
  };

  const count = selectedIds.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Apply feedback template to selected attempts"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-16 sm:pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-xl overflow-hidden"
      >
        <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
            Bulk grade
          </p>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Apply feedback to {count} attempt{count === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Write the feedback once; we&rsquo;ll send it to every selected
            attempt in one go.
          </p>
        </header>

        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Already-graded warning */}
          {alreadyGradedCount > 0 && (
            <div
              role="alert"
              className="rounded-lg bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
            >
              <strong>{alreadyGradedCount}</strong> of these attempt
              {alreadyGradedCount === 1 ? " is" : "s are"} already graded.
              Their existing feedback will be{" "}
              <strong>REPLACED</strong>. Continue?
            </div>
          )}

          {/* Feedback */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Feedback template
            </label>
            <MarkdownEditor
              value={feedbackHtml}
              onChange={setFeedbackHtml}
              placeholder="The same feedback will be applied to every selected attempt…"
              minHeight={180}
              disabled={busy}
            />
            {feedbackTooLong && (
              <p
                role="alert"
                className="mt-1.5 text-xs text-amber-700 dark:text-amber-300"
              >
                Feedback over {MAX_RECOMMENDED_FEEDBACK_CHARS.toLocaleString()}{" "}
                chars; consider trimming. You can still apply.
              </p>
            )}
          </div>

          {/* Score override */}
          <div>
            <label
              htmlFor="bulk-grade-score"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5"
            >
              Score override (optional, 0&ndash;100)
            </label>
            <input
              id="bulk-grade-score"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={scoreRaw}
              onChange={(e) => setScoreRaw(e.target.value)}
              disabled={busy}
              placeholder="Leave blank to keep existing scores"
              className="block w-40 min-h-[40px] rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
            {scoreInvalid && (
              <p
                role="alert"
                className="mt-1.5 text-xs text-rose-600 dark:text-rose-400"
              >
                Score must be a number between 0 and 100.
              </p>
            )}
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              If blank, existing scores are not touched.
            </p>
          </div>

          {/* Mark as graded */}
          <label className="flex items-center gap-2.5 select-none cursor-pointer min-h-[40px]">
            <input
              type="checkbox"
              checked={markAsGraded}
              onChange={(e) => setMarkAsGraded(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 rounded ring-1 ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">
              Mark as graded (stamps graded_at + grader_id)
            </span>
          </label>
        </div>

        <footer className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[40px] rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Applying…" : `Apply to ${count}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
