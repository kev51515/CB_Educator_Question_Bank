/**
 * TeacherAttemptDetailView — grading + data-loading hooks
 * =======================================================
 * Stateful logic moved verbatim from the original single-file component.
 *
 * `useAttemptGrading` owns:
 *   • loading the attempt (fetchAttemptReview) + surfacing the title
 *   • the one-shot localStorage→DB drain of Wave 20A grading drafts
 *   • feedback / score-override / graded-at state + their persistence
 *     callbacks (optimistic UI, rollback on error)
 *
 * `useAttemptKeyboard` wires the Cmd/Ctrl+S, Cmd/Ctrl+Enter and J/K shortcuts.
 * It lives apart from sibling-nav so the save callbacks (here) and the nav
 * derivations (sibling-nav-hooks) can be combined without a hook cycle.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { fetchAttemptReview, type AttemptReviewData } from "@/lib/attemptReview";
import { useToast } from "@/components/Toast";
import {
  FEEDBACK_DEBOUNCE_MS,
  feedbackLegacyKey,
  scoreLegacyKey,
  gradedAtLegacyKey,
  readLegacy,
  clearLegacy,
} from "@/teacher/teacherAttemptGradingHelpers";
import type { TeacherAttemptDetailViewProps } from "./types";

export function useAttemptGrading(
  attemptId: string,
  onAssignmentTitle: TeacherAttemptDetailViewProps["onAssignmentTitle"],
) {
  const toast = useToast();
  const { profile } = useProfile();

  const [data, setData] = useState<AttemptReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Grading state — initialized from the DB row, NOT localStorage.
  const [feedbackHtml, setFeedbackHtml] = useState<string>("");
  const [scoreOverride, setScoreOverride] = useState<string>("");
  const [gradedAt, setGradedAt] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);

  const feedbackTimerRef = useRef<number | null>(null);
  const lastSavedFeedbackRef = useRef<string>("");
  const drainAttemptedRef = useRef<string | null>(null);

  // Persist the four grading columns to the DB. Returns {ok, error}. The
  // caller owns optimistic state + rollback.
  const updateGradingFields = useCallback(
    async (
      patch: Partial<{
        feedback_text: string | null;
        score_override: number | null;
        graded_at: string | null;
        grader_id: string | null;
      }>,
    ): Promise<{ ok: boolean; message: string | null }> => {
      const { error: updateError } = await supabase
        .from("assignment_attempts")
        .update(patch)
        .eq("id", attemptId);
      if (updateError) {
        return { ok: false, message: updateError.message };
      }
      return { ok: true, message: null };
    },
    [attemptId],
  );

  // Load the attempt
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data: fetched, error: fetchError } = await fetchAttemptReview(
        attemptId,
      );
      if (cancelled) return;
      setData(fetched);
      setError(fetchError);
      setLoading(false);

      if (fetched) {
        // Seed local state from the DB row.
        setFeedbackHtml(fetched.feedbackText ?? "");
        lastSavedFeedbackRef.current = fetched.feedbackText ?? "";
        setScoreOverride(
          fetched.scoreOverride !== null
            ? String(fetched.scoreOverride)
            : fetched.scorePercent !== null
              ? String(Math.round(fetched.scorePercent))
              : "",
        );
        setGradedAt(fetched.gradedAt);
      }
    })();
    return () => {
      cancelled = true;
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
    };
  }, [attemptId]);

  // Surface the assignment title to an optional listener (route wrapper →
  // breadcrumb). Fires null while loading so the crumb never shows a stale
  // title from a previous attempt.
  useEffect(() => {
    onAssignmentTitle?.(data?.assignmentTitle ?? null);
  }, [data?.assignmentTitle, onAssignmentTitle]);

  // ---------------------------------------------------------------------------
  // Drain legacy localStorage drafts → DB (one-shot per attempt).
  //
  // Strategy:
  //   1. After the attempt loads, check the 3 legacy keys.
  //   2. Build a patch of {column → legacy value} ONLY for columns whose
  //      current DB value is null AND have a non-empty legacy value. This
  //      protects against overwriting a teacher's later DB edit with stale
  //      browser state.
  //   3. Single UPDATE; on success clear all 3 keys + toast + re-seed state
  //      from the patch. On failure leave localStorage alone (so the next
  //      visit can retry) and toast the error.
  //   4. drainAttemptedRef guards against re-entry within one attempt-id.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!data || !profile) return;
    if (drainAttemptedRef.current === attemptId) return;
    drainAttemptedRef.current = attemptId;

    const legacyFeedback = readLegacy(feedbackLegacyKey(attemptId));
    const legacyScoreRaw = readLegacy(scoreLegacyKey(attemptId));
    const legacyGradedAt = readLegacy(gradedAtLegacyKey(attemptId));

    const patch: {
      feedback_text?: string;
      score_override?: number;
      graded_at?: string;
      grader_id?: string;
    } = {};

    if (
      data.feedbackText === null &&
      legacyFeedback !== null &&
      legacyFeedback.trim().length > 0
    ) {
      patch.feedback_text = legacyFeedback;
    }

    if (
      data.scoreOverride === null &&
      legacyScoreRaw !== null &&
      legacyScoreRaw.trim().length > 0
    ) {
      const n = Number(legacyScoreRaw);
      if (Number.isFinite(n) && n >= 0 && n <= 100) {
        patch.score_override = n;
      }
    }

    if (
      data.gradedAt === null &&
      legacyGradedAt !== null &&
      legacyGradedAt.trim().length > 0
    ) {
      patch.graded_at = legacyGradedAt;
    }

    if (Object.keys(patch).length === 0) {
      // Nothing to drain. Still clear any leftover keys so they don't
      // accumulate; their values were already null-equivalent or already
      // persisted.
      clearLegacy(feedbackLegacyKey(attemptId));
      clearLegacy(scoreLegacyKey(attemptId));
      clearLegacy(gradedAtLegacyKey(attemptId));
      return;
    }

    // Stamp the grader on any drain so audit attribution is correct.
    patch.grader_id = profile.id;

    void (async () => {
      const { ok, message } = await updateGradingFields(patch);
      if (!ok) {
        toast.error(
          "Couldn't sync local grading drafts",
          message ?? "Will retry next visit.",
        );
        return;
      }
      // Persist UI state from the drained patch.
      if (patch.feedback_text !== undefined) {
        setFeedbackHtml(patch.feedback_text);
        lastSavedFeedbackRef.current = patch.feedback_text;
      }
      if (patch.score_override !== undefined) {
        setScoreOverride(String(patch.score_override));
      }
      if (patch.graded_at !== undefined) {
        setGradedAt(patch.graded_at);
      }
      clearLegacy(feedbackLegacyKey(attemptId));
      clearLegacy(scoreLegacyKey(attemptId));
      clearLegacy(gradedAtLegacyKey(attemptId));
      toast.success("Grading drafts saved to server");
    })();
  }, [data, profile, attemptId, updateGradingFields, toast]);

  // ---------------------------------------------------------------------------
  // Feedback persistence — UPDATE on debounce / blur with optimistic UI.
  // ---------------------------------------------------------------------------
  const persistFeedback = useCallback(
    async (html: string): Promise<void> => {
      if (html === lastSavedFeedbackRef.current) return;
      const previous = lastSavedFeedbackRef.current;
      lastSavedFeedbackRef.current = html; // optimistic
      setSavingFeedback(true);
      const { ok, message } = await updateGradingFields({
        feedback_text: html.length === 0 ? null : html,
        grader_id: profile?.id ?? null,
      });
      setSavingFeedback(false);
      if (!ok) {
        // Roll back optimistic ref + UI state to the last good value.
        lastSavedFeedbackRef.current = previous;
        setFeedbackHtml(previous);
        toast.error("Couldn't save feedback", message ?? undefined);
      }
    },
    [updateGradingFields, profile, toast],
  );

  // Debounced autosave for the feedback editor.
  const onChangeFeedback = useCallback(
    (html: string) => {
      setFeedbackHtml(html);
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = window.setTimeout(() => {
        void persistFeedback(html);
      }, FEEDBACK_DEBOUNCE_MS);
    },
    [persistFeedback],
  );

  // Save on blur (immediate flush).
  const flushFeedback = useCallback(
    async (silent = true): Promise<void> => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      if (feedbackHtml === lastSavedFeedbackRef.current) return;
      await persistFeedback(feedbackHtml);
      if (!silent) toast.success("Feedback saved");
    },
    [feedbackHtml, persistFeedback, toast],
  );

  // ---------------------------------------------------------------------------
  // Score override — UPDATE on blur / Cmd+S with optimistic UI.
  // ---------------------------------------------------------------------------
  const persistScoreOverride = useCallback(async (): Promise<void> => {
    const trimmed = scoreOverride.trim();
    let newValue: number | null = null;
    if (trimmed.length > 0) {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        toast.error("Invalid score", "Enter a number between 0 and 100.");
        return;
      }
      newValue = num;
    }
    const previousServer = data?.scoreOverride ?? null;
    if (newValue === previousServer) return;
    const previousUi = scoreOverride;
    setScoreOverride(newValue === null ? "" : String(newValue));
    const { ok, message } = await updateGradingFields({
      score_override: newValue,
      grader_id: profile?.id ?? null,
    });
    if (!ok) {
      setScoreOverride(previousUi);
      toast.error("Couldn't save score override", message ?? undefined);
      return;
    }
    // Refresh local cached row so the next blur compares against the new value.
    if (data) {
      setData({ ...data, scoreOverride: newValue });
    }
  }, [scoreOverride, data, updateGradingFields, profile, toast]);

  const onBlurScoreOverride = useCallback(() => {
    void persistScoreOverride();
  }, [persistScoreOverride]);

  // ---------------------------------------------------------------------------
  // Mark as graded ↔ ungraded toggle.
  // ---------------------------------------------------------------------------
  const onToggleGraded = useCallback(async () => {
    const isGraded = gradedAt !== null;
    const nextGradedAt = isGraded ? null : new Date().toISOString();
    const nextGraderId = isGraded ? null : (profile?.id ?? null);
    const previous = gradedAt;
    setGradedAt(nextGradedAt); // optimistic
    // Flush any pending feedback/score writes first so the audit row reflects
    // the final state.
    await flushFeedback(true);
    await persistScoreOverride();
    const { ok, message } = await updateGradingFields({
      graded_at: nextGradedAt,
      grader_id: nextGraderId,
    });
    if (!ok) {
      setGradedAt(previous);
      toast.error(
        isGraded ? "Couldn't unmark" : "Couldn't mark graded",
        message ?? undefined,
      );
      return;
    }
    toast.success(isGraded ? "Marked ungraded" : "Marked graded");
  }, [
    gradedAt,
    profile,
    flushFeedback,
    persistScoreOverride,
    updateGradingFields,
    toast,
  ]);

  return {
    data,
    setData,
    loading,
    error,
    feedbackHtml,
    scoreOverride,
    setScoreOverride,
    gradedAt,
    savingFeedback,
    flushFeedback,
    persistScoreOverride,
    onChangeFeedback,
    onBlurScoreOverride,
    onToggleGraded,
  };
}

/**
 * Keyboard shortcuts. Skipped when the feedback editor or score input
 * is the active element. Moved verbatim; the orchestrator owns onSaveAndNext
 * (it bridges grading saves + sibling nav) and passes it in.
 */
export function useAttemptKeyboard(args: {
  flushFeedback: (silent?: boolean) => Promise<void>;
  persistScoreOverride: () => Promise<void>;
  onSaveAndNext: () => Promise<void>;
  prevId: string | null;
  nextId: string | null;
  navigateToSibling: (siblingAttemptId: string) => void;
}) {
  const {
    flushFeedback,
    persistScoreOverride,
    onSaveAndNext,
    prevId,
    nextId,
    navigateToSibling,
  } = args;

  useEffect(() => {
    function isEditing(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      if (el.getAttribute("contenteditable") === "true") return true;
      return false;
    }

    function handler(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void (async () => {
          await flushFeedback(false);
          await persistScoreOverride();
        })();
        return;
      }
      if (cmd && e.key === "Enter") {
        e.preventDefault();
        void onSaveAndNext();
        return;
      }
      if (isEditing()) return;
      if (e.key === "j" || e.key === "J" || e.key === "ArrowDown") {
        if (nextId) {
          e.preventDefault();
          navigateToSibling(nextId);
        }
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") {
        if (prevId) {
          e.preventDefault();
          navigateToSibling(prevId);
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    flushFeedback,
    persistScoreOverride,
    onSaveAndNext,
    prevId,
    nextId,
    navigateToSibling,
  ]);
}

// Re-export the editor constants so the UI sub-components can import them from
// one place alongside the hooks. Values are unchanged.
export { FEEDBACK_DEBOUNCE_MS, FEEDBACK_MAX_LEN } from "@/teacher/teacherAttemptGradingHelpers";
