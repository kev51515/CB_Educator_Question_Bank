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
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { ResponsiveModal } from "@/components";
import { useToast } from "@/components/Toast";
import { useProfile } from "@/lib/profile";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  type FeedbackTemplate,
  deleteTemplate,
  listTemplates,
  saveTemplate,
  touchTemplate,
} from "./feedbackTemplates";

const MAX_RECOMMENDED_FEEDBACK_CHARS = 5000;

/**
 * Approximates the visible character count of a TipTap HTML payload by
 * stripping tags and collapsing whitespace. TipTap inflates raw HTML 3-5×
 * over the actual prose, so comparing `feedbackHtml.length` against the
 * 5000-char threshold flagged legitimate ~1500-char essays. A cheap regex
 * is sufficient here — this is a soft heuristic, not a sanitizer.
 */
function plainTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().length;
}

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

  // --- Feedback templates ---------------------------------------------------
  const { profile } = useProfile();
  const teacherId = profile?.id ?? "";
  const toast = useToast();

  const [templates, setTemplates] = useState<FeedbackTemplate[]>([]);
  const [showSaveForm, setShowSaveForm] = useState<boolean>(false);
  const [saveLabel, setSaveLabel] = useState<string>("");
  // Replaces the old `window.confirm` calls per CLAUDE.md forbidden-pattern
  // rule. ConfirmDialog renders against these when non-null.
  const [pendingLoadTemplate, setPendingLoadTemplate] =
    useState<FeedbackTemplate | null>(null);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] =
    useState<FeedbackTemplate | null>(null);
  // Tracks the template most recently *loaded* into the editor — bumped on
  // Apply so the "most recently used" sort surfaces the right pill next time.
  const lastLoadedTemplateIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!teacherId) {
      setTemplates([]);
      return;
    }
    setTemplates(listTemplates(teacherId));
  }, [teacherId]);

  const refreshTemplates = (): void => {
    if (!teacherId) return;
    setTemplates(listTemplates(teacherId));
  };

  // Cmd/Ctrl+Enter to apply (when valid). Esc-to-close is owned by
  // ResponsiveModal. The handler reads the latest `canApply` via a ref so we
  // don't have to recompute the listener on every keystroke in the editor.
  const canApplyRef = useRef<boolean>(false);
  const handleApplyRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (canApplyRef.current) {
          e.preventDefault();
          handleApplyRef.current();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const feedbackTooLong =
    plainTextLength(feedbackHtml) > MAX_RECOMMENDED_FEEDBACK_CHARS;

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
    // If a template was loaded into the editor and the teacher is applying
    // it, bump lastUsedAt so the chip surfaces first next time.
    if (teacherId && lastLoadedTemplateIdRef.current && feedbackPresent) {
      touchTemplate(teacherId, lastLoadedTemplateIdRef.current);
    }
    void onApply(patch);
  };

  // Sync refs so the Cmd+Enter handler always sees the latest values without
  // re-binding the window listener on every keystroke.
  canApplyRef.current = canApply;
  handleApplyRef.current = handleApply;

  // Whether the teacher has any unsaved changes in the form. Drives the
  // Reset button visibility — only show when there's something to discard.
  const hasChanges =
    feedbackPresent || scoreRaw.trim().length > 0 || !markAsGraded;

  const handleReset = (): void => {
    if (busy || !hasChanges) return;
    setFeedbackHtml("");
    setScoreRaw("");
    setMarkAsGraded(true);
    lastLoadedTemplateIdRef.current = null;
  };

  // A short summary of what this Apply will actually do — surfaced on the
  // primary CTA so teachers see "score only" vs "feedback + score" before
  // committing. Prevents accidental empty-feedback broadcasts.
  const applySummary = (() => {
    const parts: string[] = [];
    if (feedbackPresent) parts.push("feedback");
    if (scoreNumber !== null && !scoreInvalid) parts.push("score");
    if (parts.length === 0) return "";
    return parts.join(" + ");
  })();

  // --- Template handlers ----------------------------------------------------
  const applyTemplateLoad = (tpl: FeedbackTemplate): void => {
    setFeedbackHtml(tpl.body);
    lastLoadedTemplateIdRef.current = tpl.id;
  };

  const handleLoadTemplate = (tpl: FeedbackTemplate): void => {
    if (busy) return;
    if (feedbackPresent) {
      // Editor already has content — confirm replace via ConfirmDialog.
      setPendingLoadTemplate(tpl);
      return;
    }
    applyTemplateLoad(tpl);
  };

  const performDeleteTemplate = (tpl: FeedbackTemplate): void => {
    if (!teacherId) return;
    try {
      deleteTemplate(teacherId, tpl.id);
      if (lastLoadedTemplateIdRef.current === tpl.id) {
        lastLoadedTemplateIdRef.current = null;
      }
      refreshTemplates();
      toast.success("Template deleted");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Couldn't delete template", msg);
    }
  };

  const handleDeleteTemplate = (tpl: FeedbackTemplate): void => {
    if (!teacherId || busy) return;
    setPendingDeleteTemplate(tpl);
  };

  const handleOpenSaveForm = (): void => {
    if (!feedbackPresent || busy) return;
    setSaveLabel("");
    setShowSaveForm(true);
  };

  const handleCancelSaveForm = (): void => {
    setShowSaveForm(false);
    setSaveLabel("");
  };

  const handleConfirmSaveTemplate = (): void => {
    if (!teacherId) return;
    const label = saveLabel.trim();
    if (label.length === 0) {
      toast.error("Template needs a name");
      return;
    }
    try {
      const created = saveTemplate(teacherId, { label, body: feedbackHtml });
      lastLoadedTemplateIdRef.current = created.id;
      refreshTemplates();
      setShowSaveForm(false);
      setSaveLabel("");
      toast.success("Template saved");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // QuotaExceededError surfaces here too.
      toast.error("Couldn't save template", msg);
    }
  };

  const count = selectedIds.length;

  const footer = (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        {hasChanges && (
          <button
            type="button"
            onClick={handleReset}
            disabled={busy}
            className="min-h-[40px] rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            Reset
          </button>
        )}
        {canApply && (
          <span className="hidden sm:inline">
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 ring-1 ring-slate-300 dark:ring-slate-700 text-[10px] font-mono">
              ⌘↵
            </kbd>{" "}
            to apply
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
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
          title={
            applySummary
              ? `Apply ${applySummary} to ${count} attempt${count === 1 ? "" : "s"}`
              : undefined
          }
          className="min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy
            ? "Applying…"
            : applySummary
              ? `Apply ${applySummary} to ${count}`
              : `Apply to ${count}`}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <ResponsiveModal
        open={true}
        onClose={onClose}
        size="xl"
        dismissible={!busy}
        title={`Apply feedback to ${count} attempt${count === 1 ? "" : "s"}`}
        subtitle="Write the feedback once; we'll send it to every selected attempt in one go."
        footer={footer}
      >
        <div className="space-y-5">
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

            {/* Saved-template chip row */}
            {teacherId && (
              <div className="mb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Templates
                  </span>
                  {templates.length === 0 && !showSaveForm && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      No templates yet. Save one to reuse it next time.
                    </span>
                  )}
                  {templates.map((tpl) => (
                    <span
                      key={tpl.id}
                      className="inline-flex items-stretch rounded-full bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-800 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadTemplate(tpl)}
                        disabled={busy}
                        title={tpl.label}
                        className="min-h-[40px] pl-3 pr-2 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset disabled:opacity-50 max-w-[200px] truncate"
                      >
                        {tpl.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl)}
                        disabled={busy}
                        aria-label={`Delete template ${tpl.label}`}
                        className="min-w-[40px] min-h-[40px] px-2 text-indigo-500 dark:text-indigo-300 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-inset disabled:opacity-50"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {feedbackPresent && !showSaveForm && (
                    <button
                      type="button"
                      onClick={handleOpenSaveForm}
                      disabled={busy}
                      className="inline-flex items-center min-h-[40px] rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-dashed ring-slate-300 dark:ring-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      + Save current as template
                    </button>
                  )}
                </div>
                {showSaveForm && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={saveLabel}
                      onChange={(e) => setSaveLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleConfirmSaveTemplate();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          handleCancelSaveForm();
                        }
                      }}
                      maxLength={60}
                      autoFocus
                      placeholder="Template name (e.g. Slope-intercept tips)"
                      className="block flex-1 min-w-[240px] min-h-[40px] rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleConfirmSaveTemplate}
                      disabled={busy || saveLabel.trim().length === 0}
                      className="min-h-[40px] rounded-lg px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelSaveForm}
                      disabled={busy}
                      className="min-h-[40px] rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

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
              data-autofocus
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={scoreRaw}
              onChange={(e) => setScoreRaw(e.target.value)}
              onBlur={(e) => {
                // Auto-clamp to 0–100 on blur so a pasted 250 or -5 lands
                // inside the valid range without the teacher noticing.
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || e.target.value.trim() === "") return;
                if (n < 0) setScoreRaw("0");
                else if (n > 100) setScoreRaw("100");
              }}
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
      </ResponsiveModal>
      {pendingLoadTemplate && (
        <ConfirmDialog
          title="Replace current feedback?"
          body={
            <p>
              Load the{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                "{pendingLoadTemplate.label}"
              </span>{" "}
              template into the editor? This replaces whatever you've typed so
              far.
            </p>
          }
          confirmLabel="Replace"
          onConfirm={async () => {
            const tpl = pendingLoadTemplate;
            setPendingLoadTemplate(null);
            applyTemplateLoad(tpl);
          }}
          onCancel={() => setPendingLoadTemplate(null)}
        />
      )}
      {pendingDeleteTemplate && (
        <ConfirmDialog
          title="Delete this template?"
          body={
            <p>
              Delete{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                "{pendingDeleteTemplate.label}"
              </span>{" "}
              permanently. Saved templates are stored locally on this device.
            </p>
          }
          confirmLabel="Delete template"
          destructive
          onConfirm={async () => {
            const tpl = pendingDeleteTemplate;
            setPendingDeleteTemplate(null);
            performDeleteTemplate(tpl);
          }}
          onCancel={() => setPendingDeleteTemplate(null)}
        />
      )}
    </>
  );
}
