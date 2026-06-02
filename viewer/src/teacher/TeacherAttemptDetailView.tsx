/**
 * TeacherAttemptDetailView
 * ========================
 * Teacher-facing detail view of a single student's submitted attempt.
 *
 * Grading state — feedback_text, score_override, graded_at, grader_id — now
 * persists to the database (migration 0053). On mount we ALSO drain any
 * residual localStorage drafts from the Wave 20A MVP buffer into the
 * corresponding DB columns, then clear them. After that:
 *
 *   • Feedback editor (MarkdownEditor) autosaves on blur + 1.5s after typing
 *     pauses. Optimistic local update, server UPDATE in the background, roll
 *     back on error.
 *   • Score override (numeric 0-100) saves on blur.
 *   • "Mark as graded" / "Mark ungraded" toggle UPDATEs graded_at + grader_id.
 *   • J/K (or arrow) navigation between attempts on the same assignment.
 *     Cmd/Ctrl+S force-saves. Cmd/Ctrl+Enter saves + advances.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useProfile } from "../lib/profile";
import {
  fetchAttemptReview,
  formatAttemptTimestamp,
  formatDurationSeconds,
  type AttemptReviewData,
} from "../lib/attemptReview";
import { AnswerReview } from "../mocktest/components/AnswerReview";
import { ModuleBreakdownTable } from "../mocktest/components/ModuleBreakdownTable";
import { ScoreHero } from "../mocktest/components/ScoreHero";
import { SectionBreakdownCards } from "../mocktest/components/SectionBreakdownCards";
import { SkillBreakdownCard } from "../mocktest/components/SkillBreakdownCard";
import { SkeletonRows } from "../components/Skeleton";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useToast } from "../components/Toast";
import { useClassContext } from "./classLayoutContext";
import { classAssignmentAttemptPath } from "../lib/routes";
import {
  FEEDBACK_DEBOUNCE_MS,
  FEEDBACK_MAX_LEN,
  feedbackLegacyKey,
  scoreLegacyKey,
  gradedAtLegacyKey,
  readLegacy,
  clearLegacy,
} from "./teacherAttemptGradingHelpers";

interface TeacherAttemptDetailViewProps {
  attemptId: string;
  onBack: () => void;
}

interface SiblingAttempt {
  id: string;
  student_id: string;
  display_name: string;
}

export function TeacherAttemptDetailView({
  attemptId,
  onBack,
}: TeacherAttemptDetailViewProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useProfile();
  // useClassContext may be unavailable if this view is mounted outside
  // ClassLayout; guard so the view still renders without J/K navigation.
  let courseShortCode: string | null = null;
  try {
    const ctx = useClassContext();
    courseShortCode = ctx.cls.short_code ?? null;
  } catch {
    courseShortCode = null;
  }

  const [data, setData] = useState<AttemptReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(true);

  // Grading state — initialized from the DB row, NOT localStorage.
  const [feedbackHtml, setFeedbackHtml] = useState<string>("");
  const [scoreOverride, setScoreOverride] = useState<string>("");
  const [gradedAt, setGradedAt] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);

  // Sibling attempts for J/K navigation. Loaded after data resolves.
  const [siblings, setSiblings] = useState<SiblingAttempt[]>([]);

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

  // Load sibling attempts (other students on the same assignment) so we
  // can offer prev/next navigation. We join profiles for display names.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: rows, error: fetchErr } = await supabase
          .from("assignment_attempts")
          .select(
            "id, student_id, started_at, student:profiles!assignment_attempts_student_id_fkey(display_name, email)",
          )
          .eq("assignment_id", data.assignmentId)
          .order("started_at", { ascending: true });
        if (cancelled) return;
        if (fetchErr || !rows) return;
        const mapped: SiblingAttempt[] = (rows as unknown as {
          id: string;
          student_id: string;
          student: { display_name: string | null; email: string } | null;
        }[]).map((r) => ({
          id: r.id,
          student_id: r.student_id,
          display_name:
            r.student?.display_name ?? r.student?.email ?? "Unknown student",
        }));
        setSiblings(mapped);
      } catch {
        // Non-fatal — prev/next will just hide.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Derive prev/next from the sibling list.
  const navInfo = useMemo(() => {
    if (siblings.length === 0) {
      return { index: -1, prevId: null, nextId: null, total: 0 } as const;
    }
    const index = siblings.findIndex((s) => s.id === attemptId);
    if (index === -1) {
      return { index: -1, prevId: null, nextId: null, total: siblings.length } as const;
    }
    return {
      index,
      total: siblings.length,
      prevId: index > 0 ? siblings[index - 1].id : null,
      nextId: index < siblings.length - 1 ? siblings[index + 1].id : null,
    } as const;
  }, [siblings, attemptId]);

  const navigateToSibling = useCallback(
    (siblingAttemptId: string) => {
      if (!data) return;
      if (courseShortCode) {
        navigate(
          classAssignmentAttemptPath(
            courseShortCode,
            data.assignmentId,
            siblingAttemptId,
          ),
        );
      } else {
        const path = window.location.pathname.replace(attemptId, siblingAttemptId);
        navigate(path);
      }
    },
    [data, navigate, attemptId, courseShortCode],
  );

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

  const onSaveAndNext = useCallback(async () => {
    await flushFeedback(true);
    await persistScoreOverride();
    if (navInfo.nextId) {
      navigateToSibling(navInfo.nextId);
      toast.success("Saved · next student");
    } else {
      toast.success("Saved");
    }
  }, [
    flushFeedback,
    persistScoreOverride,
    navInfo.nextId,
    navigateToSibling,
    toast,
  ]);

  // Keyboard shortcuts. Skipped when the feedback editor or score input
  // is the active element.
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
        if (navInfo.nextId) {
          e.preventDefault();
          navigateToSibling(navInfo.nextId);
        }
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") {
        if (navInfo.prevId) {
          e.preventDefault();
          navigateToSibling(navInfo.prevId);
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    flushFeedback,
    persistScoreOverride,
    onSaveAndNext,
    navInfo.prevId,
    navInfo.nextId,
    navigateToSibling,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-6">
        <div className="mx-auto max-w-5xl">
          <SkeletonRows count={3} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Couldn't load this attempt
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {error ?? "Attempt not found."}
          </p>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 min-h-[40px]"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const hasResult = data.result !== null;
  const cbCount = data.questions.filter((q) => q.source === "cb").length;
  const satCount = data.questions.filter((q) => q.source === "sat").length;

  // ---------------------------------------------------------------------------
  // Per-question status + skill tallies, derived from the snapshot (no extra
  // SELECTs). For each snapshot question we look up the student's answer in
  // `data.answers` (keyed by question id) and classify it as correct / wrong /
  // skipped. We use that classification for both the per-question detail
  // table AND the skill breakdown so the two sections always agree.
  // ---------------------------------------------------------------------------
  type AnswerStatus = "correct" | "wrong" | "skipped";

  const perQuestionRows = useMemo(() => {
    return data.questions.map((q, index) => {
      const chosen = data.answers[q.id] ?? null;
      let status: AnswerStatus;
      if (chosen === null) status = "skipped";
      else if (chosen === q.correctAnswer) status = "correct";
      else status = "wrong";
      return {
        position: index + 1,
        questionId: q.id,
        chosen,
        correctAnswer: q.correctAnswer,
        status,
        skill: q.skill ?? null,
        domain: q.domain,
      };
    });
  }, [data.questions, data.answers]);

  const skillTallies = useMemo(() => {
    // Group by skill (falling back to domain) → {correct, wrong, skipped, total}.
    const map = new Map<
      string,
      { correct: number; wrong: number; skipped: number; total: number }
    >();
    for (const row of perQuestionRows) {
      const key = row.skill ?? row.domain ?? "Unspecified";
      const bucket = map.get(key) ?? {
        correct: 0,
        wrong: 0,
        skipped: 0,
        total: 0,
      };
      bucket.total += 1;
      if (row.status === "correct") bucket.correct += 1;
      else if (row.status === "wrong") bucket.wrong += 1;
      else bucket.skipped += 1;
      map.set(key, bucket);
    }
    // Sort by weakest-first (lowest correct rate) so the teacher's eye
    // lands on what to address. Stable secondary sort by total desc.
    return Array.from(map.entries())
      .map(([label, counts]) => ({ label, ...counts }))
      .sort((a, b) => {
        const ar = a.total === 0 ? 1 : a.correct / a.total;
        const br = b.total === 0 ? 1 : b.correct / b.total;
        if (ar !== br) return ar - br;
        return b.total - a.total;
      });
  }, [perQuestionRows]);

  // The question-snapshot is the source of truth for "do we have skill data".
  // If every question lacks a skill AND there's no domain string, we skip the
  // section. In practice CB questions always have a domain, so this rarely
  // fires; mostly it's a guard against future drift.
  const hasSkillData = useMemo(
    () => data.questions.some((q) => (q.skill ?? q.domain) !== undefined),
    [data.questions],
  );

  // Avg time per question — only meaningful when both numerator and
  // denominator are defined and the test isn't empty.
  const avgSecondsPerQuestion = useMemo(() => {
    const dur = data.durationSeconds ?? data.result?.durationSeconds ?? null;
    const total = data.totalQuestions ?? data.result?.totalQuestions ?? null;
    if (dur === null || total === null || total <= 0) return null;
    return dur / total;
  }, [data.durationSeconds, data.totalQuestions, data.result]);

  const studentLabel =
    data.studentDisplayName ?? data.studentEmail ?? "Unknown student";
  const autoScore = data.scorePercent;
  const positionLabel =
    navInfo.index >= 0 && navInfo.total > 0
      ? `Student ${navInfo.index + 1} of ${navInfo.total}`
      : null;
  const isGraded = gradedAt !== null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 px-2 py-1 min-h-[40px]"
          >
            <span aria-hidden>←</span> Back to attempts
          </button>
          {positionLabel && (
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <button
                type="button"
                onClick={() => navInfo.prevId && navigateToSibling(navInfo.prevId)}
                disabled={!navInfo.prevId}
                className="rounded-md px-3 py-2 min-h-[40px] text-xs font-medium ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Previous student (K)"
                aria-label="Previous student"
              >
                ← Prev
              </button>
              <span className="tabular-nums">{positionLabel}</span>
              <button
                type="button"
                onClick={() => navInfo.nextId && navigateToSibling(navInfo.nextId)}
                disabled={!navInfo.nextId}
                className="rounded-md px-3 py-2 min-h-[40px] text-xs font-medium ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Next student (J)"
                aria-label="Next student"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        <header className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-1">
          <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
            Attempt detail
          </p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Student: {studentLabel}
          </h1>
          {data.studentDisplayName && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {data.studentEmail}
            </p>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data.assignmentTitle} · Submitted{" "}
            {formatAttemptTimestamp(data.submittedAt)}
          </p>
        </header>

        {hasResult && data.result ? (
          <>
            <ScoreHero
              scorePercent={data.result.scorePercent}
              correctCount={data.result.correctCount}
              totalQuestions={data.result.totalQuestions}
              scoreOverride={data.scoreOverride}
            />
            {avgSecondsPerQuestion !== null && (
              <div
                className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                aria-label="Pacing summary"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 ring-1 ring-slate-200 dark:ring-slate-700">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Avg / question
                  </span>
                  <span className="tabular-nums text-slate-900 dark:text-slate-100">
                    {formatDurationSeconds(Math.round(avgSecondsPerQuestion))}
                  </span>
                </span>
              </div>
            )}
            <SectionBreakdownCards
              byDomain={data.result.byDomain}
              byDifficulty={data.result.byDifficulty}
            />
            <ModuleBreakdownTable
              durationSeconds={data.result.durationSeconds}
              totalQuestions={data.result.totalQuestions}
              cbCount={cbCount}
              satCount={satCount}
            />
            <SkillBreakdownCard bySkill={data.result.bySkill} />
          </>
        ) : (
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 text-sm text-slate-600 dark:text-slate-400">
            This attempt hasn't been submitted yet, or no aggregate breakdowns
            are available.
          </div>
        )}

        {/* Skill tally — collapsible. Useful for "you missed both word-problem
            questions" feedback. Default-closed to keep the page scannable. */}
        {hasSkillData && data.questions.length > 0 && (
          <details className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 group">
            <summary className="cursor-pointer list-none px-5 py-3 min-h-[40px] flex items-center justify-between gap-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Skill breakdown
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 group-open:hidden">
                Show details
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 hidden group-open:inline">
                Hide details
              </span>
            </summary>
            <ul className="px-5 pb-4 space-y-2">
              {skillTallies.map((s) => {
                const rate = s.total === 0 ? 0 : s.correct / s.total;
                const ratePct = Math.round(rate * 100);
                return (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-slate-700 dark:text-slate-200 truncate">
                      {s.label}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums text-slate-900 dark:text-slate-100 font-medium">
                        {s.correct}/{s.total} correct
                      </span>
                      <span
                        className={
                          ratePct >= 80
                            ? "rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : ratePct >= 50
                              ? "rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              : "rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                        }
                      >
                        {ratePct}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {/* Per-question detail — collapsible. Per-question TIMING (answer_time_ms /
            time_spent_ms / revisit_count) only exists on `test_answers` for
            mock tests (migrations 0042–0043). Assignment attempts only persist
            an aggregate `duration_seconds`, so we render correctness here and
            surface a clear note about the timing gap. */}
        {data.questions.length > 0 && (
          <details className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 group">
            <summary className="cursor-pointer list-none px-5 py-3 min-h-[40px] flex items-center justify-between gap-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Per-question detail
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 group-open:hidden">
                Show details
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 hidden group-open:inline">
                Hide details
              </span>
            </summary>
            <div className="px-5 pb-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Per-question timing isn&apos;t tracked for assignment attempts
                yet — only the aggregate duration above is recorded. Status is
                derived from the snapshot saved at submission time.
              </p>
              <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="text-left px-4 py-2 font-medium">
                        #
                      </th>
                      <th scope="col" className="text-left px-4 py-2 font-medium">
                        Status
                      </th>
                      <th scope="col" className="text-left px-4 py-2 font-medium">
                        Chosen
                      </th>
                      <th scope="col" className="text-left px-4 py-2 font-medium">
                        Correct
                      </th>
                      <th scope="col" className="text-left px-4 py-2 font-medium">
                        Skill
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {perQuestionRows.map((r) => (
                      <tr
                        key={r.questionId}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                      >
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400 font-mono text-xs tabular-nums">
                          {r.position}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={
                              r.status === "correct"
                                ? "inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : r.status === "wrong"
                                  ? "inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                                  : "inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            }
                          >
                            {r.status === "correct"
                              ? "Correct"
                              : r.status === "wrong"
                                ? "Wrong"
                                : "Skipped"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100 font-medium">
                          {r.chosen ?? (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                          {r.correctAnswer}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400 truncate max-w-[14rem]">
                          {r.skill ?? r.domain ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        )}

        {/* Grading panel */}
        <section
          aria-labelledby="grading-title"
          className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-4"
        >
          <header className="flex items-center justify-between gap-3 flex-wrap">
            <h2
              id="grading-title"
              className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
            >
              Grading
            </h2>
            <div className="flex items-center gap-2">
              {savingFeedback && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Saving…
                </span>
              )}
              {isGraded && !savingFeedback && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  Marked graded {formatAttemptTimestamp(gradedAt)}
                </span>
              )}
            </div>
          </header>

          <div className="space-y-2">
            <label
              htmlFor="grading-feedback"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Feedback for student
            </label>
            <div id="grading-feedback" onBlur={() => void flushFeedback(true)}>
              <MarkdownEditor
                value={feedbackHtml}
                onChange={onChangeFeedback}
                placeholder="What did this student do well? What should they work on?"
                minHeight={140}
                characterLimit={FEEDBACK_MAX_LEN}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Autosaves to the server on blur and{" "}
              {Math.round(FEEDBACK_DEBOUNCE_MS / 1000)}s after you stop typing.
              Cmd/Ctrl+S to flush, Cmd/Ctrl+Enter to save and advance to the
              next student.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label
                htmlFor="grading-score-override"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Score override
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="grading-score-override"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  value={scoreOverride}
                  onChange={(e) => setScoreOverride(e.target.value)}
                  onBlur={onBlurScoreOverride}
                  className="rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-700 px-3 py-2 min-h-[40px] text-sm w-24 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-describedby="grading-score-help"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  %
                </span>
              </div>
              <p
                id="grading-score-help"
                className="text-xs text-slate-500 dark:text-slate-400"
              >
                Auto-computed: {autoScore === null ? "—" : `${Math.round(autoScore)}%`}
                . Override here if you want to credit partial work.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <button
                type="button"
                onClick={() => void onToggleGraded()}
                className={
                  isGraded
                    ? "rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 text-sm font-medium px-4 py-2 min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    : "rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                }
              >
                {isGraded ? "Mark ungraded" : "Mark as graded"}
              </button>
              <button
                type="button"
                onClick={() => void onSaveAndNext()}
                disabled={!navInfo.nextId}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Save & Next (Cmd/Ctrl+Enter)"
              >
                Save & Next →
              </button>
            </div>
          </div>
        </section>

        {data.questions.length > 0 ? (
          <AnswerReview
            questions={data.questions}
            answers={data.answers}
            open={reviewOpen}
            onToggle={() => setReviewOpen((open) => !open)}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">
            Per-question review is unavailable for this attempt (no question
            snapshot was saved).
          </div>
        )}
      </div>
    </div>
  );
}
