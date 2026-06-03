/**
 * AssignmentRunner
 * ================
 * Wrapper the AreaSelector mounts when a student clicks "Start" on an
 * assignment. Owns the `assignment_attempts` row lifecycle BEFORE the
 * MockTestApp takes over.
 *
 * Multi-attempt semantics (migration 0020):
 *   • Every Start creates a NEW attempt row — the in-progress / resume
 *     prompt is gone. Previously the RPC reset the existing row in place;
 *     now it inserts a fresh one each time.
 *   • If the student already has a SUBMITTED attempt, we still hand them to
 *     the review surface (preserving the single-submission semantics of
 *     legacy data and avoiding accidental re-attempts before max_attempts
 *     is configured).
 *   • If the assignment has a `max_attempts` limit and the student has
 *     already used them all, the RPC raises `max_attempts_reached` and we
 *     render a friendly explainer.
 *
 * Snapshot ownership: as of migration 0014, the client builds the question
 * pool via `loadSource(config)` and hands it to the RPC. The RPC stores it
 * in `assignment_attempt_questions` so review surfaces render exactly what
 * the student saw.
 *
 * Once the RPC returns, we mount MockTestApp in assignment mode with the
 * already-loaded questions so MockTestApp doesn't re-fetch (and possibly
 * receive a different shuffle).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MockTestApp,
  clearAssignmentDraft,
  type MockTestAssignmentContext,
} from "../mocktest";
import { loadSource } from "../mocktest/sources";
import type { TestConfig, TestQuestion } from "../mocktest";
import { supabase } from "../lib/supabase";
import { useToast } from "../components";
import type { StudentAssignment } from "./useStudentAssignments";
import { QBankAssignmentRunner } from "./QBankAssignmentRunner";

/**
 * Migration 0042 adds `kind` ('mocktest' | 'qbank_set'). Until
 * useStudentAssignments.ts widens the StudentAssignment type, read the new
 * fields off the runtime row via this loose extension so we can branch.
 */
type AssignmentKindFields = {
  kind?: string | null;
  qbank_set_uid?: string | null;
  qbank_set_label?: string | null;
};

interface AssignmentRunnerProps {
  assignment: StudentAssignment;
  studentId: string;
  onExit: () => void;
  /** Fired when we discover the student already submitted; lets the parent
      route to the review view instead of running the test again. */
  onAlreadySubmitted: (attemptId: string) => void;
}

type Stage =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "max-attempts"; used: number; max: number }
  | {
      // B6: a previous attempt is in-progress (submitted_at IS NULL). Show
      // the student a Resume / Start fresh decision banner before either
      // hydrating from the existing row or asking the RPC for a new one.
      kind: "resume-prompt";
      draftAttemptId: string;
      draftStartedAt: string;
    }
  | {
      kind: "ready";
      attemptId: string;
      questions: TestQuestion[];
      attemptNumber: number | null;
      maxAttempts: number | null;
    };

interface ExistingAttemptRow {
  id: string;
  submitted_at: string | null;
  started_at: string;
}

interface AttemptQuestionRow {
  position: number;
  question: TestQuestion;
}

interface StartAttemptRpcRow {
  attempt_id: string;
  question_count: number;
}

interface AssignmentPolicyRow {
  max_attempts: number | null;
}

/**
 * Map RPC error codes raised via `RAISE EXCEPTION 'xxx'` to user-facing copy.
 * Supabase surfaces the bare token in `error.message` for plpgsql RAISE so a
 * simple switch is enough; HINTs from the RPC are not propagated in the
 * default JSON shape but the code itself is sufficient signal.
 */
function describeStartError(message: string): string {
  if (message.includes("not_enrolled")) {
    return "You aren't enrolled in this assignment's course.";
  }
  if (message.includes("not_open")) {
    return "This assignment isn't open yet.";
  }
  if (message.includes("invalid_questions")) {
    return "Couldn't build a question set for this assignment.";
  }
  return message;
}

function isMaxAttemptsError(message: string): boolean {
  return message.includes("max_attempts_reached");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

function buildConfig(assignment: StudentAssignment): TestConfig {
  return {
    sourceId: assignment.source_id,
    questionCount: assignment.question_count,
    timeLimitMinutes: assignment.time_limit_minutes,
    difficultyMix: assignment.difficulty_mix,
  };
}

export function AssignmentRunner(props: AssignmentRunnerProps) {
  // Branch on assignment.kind BEFORE running mocktest bootstrap. qbank_set
  // assignments don't go through start_assignment_attempt — the static
  // test-runner owns the lifecycle and posts results back via the bridge.
  // Legacy rows default to 'mocktest' per the migration default, so untouched
  // rows continue to render the existing flow.
  const kindFields = props.assignment as StudentAssignment & AssignmentKindFields;
  if (kindFields.kind === "qbank_set") {
    return (
      <QBankAssignmentRunner assignment={kindFields} onExit={props.onExit} />
    );
  }
  return <MockTestAssignmentRunner {...props} />;
}

function MockTestAssignmentRunner({
  assignment,
  studentId,
  onExit,
  onAlreadySubmitted,
}: AssignmentRunnerProps) {
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const toast = useToast();
  // Refs gate the 5-min / 1-min auto-submit warning toasts so they fire at
  // most once per attempt. The timer countdown itself is owned by MockTestApp
  // (TestPhase) — this observer runs in parallel using the same
  // `time_limit_minutes` and the moment we hand control to MockTestApp,
  // purely so students get a heads-up before auto-submit at 0.
  const fired5MinRef = useRef(false);
  const fired1MinRef = useRef(false);

  /**
   * Build the question set client-side via `loadSource`, then call the
   * `start_assignment_attempt` RPC. Migration 0020 makes every call insert
   * a brand-new attempt row (no more in-place reset), so we read back the
   * post-insert attempt count to derive "Attempt N of M" for the header.
   *
   * Order of operations:
   *   1. Look up the most recent existing attempt + the assignment's
   *      `max_attempts` policy. Submitted attempts on single-attempt
   *      assignments bounce to review.
   *   2. Build questions, call the RPC. Handle `max_attempts_reached` as a
   *      first-class stage, not an error toast.
   *   3. After success, fetch the row count to surface "Attempt N of M".
   */
  /**
   * Internal helper: actually creates a new attempt row via the RPC.
   * Extracted so both the auto-bootstrap (no existing draft) and the
   * "Start fresh" path (user dismissed the resume banner) can share it.
   */
  const startNewAttempt = useCallback(async (opts?: { isAlive?: () => boolean }): Promise<void> => {
    const isAlive = opts?.isAlive ?? (() => true);
    if (!isAlive()) return; // cancellation guard
    setStage({ kind: "loading" });
    try {
      const { data: policyData } = await supabase
        .from("assignments")
        .select("max_attempts")
        .eq("id", assignment.id)
        .maybeSingle();
      const policy = (policyData as AssignmentPolicyRow | null) ?? {
        max_attempts: null,
      };
      const maxAttempts = policy.max_attempts;

      const config = buildConfig(assignment);
      const questions = await loadSource(config);
      if (questions.length === 0) {
        if (!isAlive()) return;
        setStage({
          kind: "error",
          message:
            "No questions matched this assignment's configuration. Ask your teacher to adjust the source or difficulty.",
        });
        return;
      }

      if (!isAlive()) return; // cancellation guard — skip RPC that would burn an attempt
      const { data, error } = await supabase.rpc("start_assignment_attempt", {
        p_assignment_id: assignment.id,
        p_questions: questions as unknown as Record<string, unknown>[],
      });

      if (error) {
        if (isMaxAttemptsError(error.message) && maxAttempts !== null) {
          const { count } = await supabase
            .from("assignment_attempts")
            .select("id", { count: "exact", head: true })
            .eq("assignment_id", assignment.id)
            .eq("student_id", studentId);
          if (!isAlive()) return;
          setStage({
            kind: "max-attempts",
            used: count ?? maxAttempts,
            max: maxAttempts,
          });
          return;
        }
        if (!isAlive()) return;
        setStage({
          kind: "error",
          message: describeStartError(error.message),
        });
        return;
      }

      const rows = (data ?? []) as StartAttemptRpcRow[];
      const row = rows[0];
      if (!row) {
        if (!isAlive()) return;
        setStage({
          kind: "error",
          message: "The server didn't return an attempt id.",
        });
        return;
      }

      let attemptNumber: number | null = null;
      if (maxAttempts !== null) {
        const { count } = await supabase
          .from("assignment_attempts")
          .select("id", { count: "exact", head: true })
          .eq("assignment_id", assignment.id)
          .eq("student_id", studentId);
        attemptNumber = count ?? null;
      }

      if (!isAlive()) return;
      setStage({
        kind: "ready",
        attemptId: row.attempt_id,
        questions,
        attemptNumber,
        maxAttempts,
      });
    } catch (err: unknown) {
      if (!isAlive()) return;
      setStage({ kind: "error", message: getErrorMessage(err) });
    }
  }, [assignment, studentId]);

  /**
   * Hydrate from the in-progress draft attempt the student picked Resume
   * for. Reads the `assignment_attempt_questions` snapshot so the question
   * order matches what was originally shown — no re-shuffle.
   *
   * Limitation: the current MockTestApp interface does not surface
   * in-progress answers/flags, so we re-mount with an empty answer state.
   * The benefits of Resume today: (a) same question pool (b) reuse the
   * existing attempt row instead of burning another attempt against
   * `max_attempts` (c) preserves the original started_at for fair timing.
   * A follow-up should add a `save_assignment_answers` RPC + write-through
   * cache so partial answers also survive.
   */
  const resumeDraft = useCallback(
    async (draftAttemptId: string): Promise<void> => {
      setStage({ kind: "loading" });
      try {
        const { data: snapData, error: snapError } = await supabase
          .from("assignment_attempt_questions")
          .select("position, question")
          .eq("attempt_id", draftAttemptId)
          .order("position", { ascending: true });
        if (snapError) {
          setStage({ kind: "error", message: snapError.message });
          return;
        }
        const snapshotRows = ((snapData ?? []) as unknown) as AttemptQuestionRow[];
        const questions = snapshotRows.map((r) => r.question);
        if (questions.length === 0) {
          // No snapshot rows → the attempt predates 0014 or got corrupted.
          // Fall back to a fresh start rather than mount with no questions.
          await startNewAttempt();
          return;
        }
        const { data: policyData } = await supabase
          .from("assignments")
          .select("max_attempts")
          .eq("id", assignment.id)
          .maybeSingle();
        const policy = (policyData as AssignmentPolicyRow | null) ?? {
          max_attempts: null,
        };
        const maxAttempts = policy.max_attempts;
        let attemptNumber: number | null = null;
        if (maxAttempts !== null) {
          const { count } = await supabase
            .from("assignment_attempts")
            .select("id", { count: "exact", head: true })
            .eq("assignment_id", assignment.id)
            .eq("student_id", studentId);
          attemptNumber = count ?? null;
        }
        setStage({
          kind: "ready",
          attemptId: draftAttemptId,
          questions,
          attemptNumber,
          maxAttempts,
        });
      } catch (err: unknown) {
        setStage({ kind: "error", message: getErrorMessage(err) });
      }
    },
    [assignment, studentId, startNewAttempt],
  );

  const bootstrap = useCallback(async (opts?: { isAlive?: () => boolean }): Promise<void> => {
    const isAlive = opts?.isAlive ?? (() => true);
    if (!isAlive()) return; // cancellation guard
    setStage({ kind: "loading" });
    try {
      const { data: existingRows, error: existingError } = await supabase
        .from("assignment_attempts")
        .select("id, submitted_at, started_at")
        .eq("assignment_id", assignment.id)
        .eq("student_id", studentId)
        .order("started_at", { ascending: false })
        .limit(1);

      if (existingError) {
        if (!isAlive()) return;
        setStage({ kind: "error", message: existingError.message });
        return;
      }
      const latest = ((existingRows ?? []) as ExistingAttemptRow[])[0];

      // Look up the assignment policy. Used both for the "already submitted
      // → review?" decision below and to render "Attempt N of M" once the
      // new attempt is created.
      const { data: policyData } = await supabase
        .from("assignments")
        .select("max_attempts")
        .eq("id", assignment.id)
        .maybeSingle();
      const policy = (policyData as AssignmentPolicyRow | null) ?? {
        max_attempts: null,
      };
      const maxAttempts = policy.max_attempts;

      // Single-attempt assignments (no max_attempts set, or set to 1) keep
      // the legacy "submitted = terminal, go to review" semantics. Teachers
      // opt into multi-attempt by setting max_attempts > 1.
      if (latest && latest.submitted_at !== null) {
        if (maxAttempts === null || maxAttempts === 1) {
          if (!isAlive()) return;
          onAlreadySubmitted(latest.id);
          return;
        }
      }

      // B6: if the most recent attempt is in-progress (submitted_at IS
      // NULL), don't burn a new attempt against max_attempts. Surface the
      // Resume / Start fresh choice to the student. The migration-0004
      // schema has no `status` column on assignment_attempts, so "in
      // progress" is signalled exclusively by `submitted_at IS NULL` (this
      // is also the convention used by the assignment_best_attempts view
      // synthesised in 0020).
      if (latest && latest.submitted_at === null) {
        if (!isAlive()) return;
        setStage({
          kind: "resume-prompt",
          draftAttemptId: latest.id,
          draftStartedAt: latest.started_at,
        });
        return;
      }

      // Otherwise no draft to resume — start a fresh attempt.
      await startNewAttempt({ isAlive });
    } catch (err: unknown) {
      if (!isAlive()) return;
      setStage({ kind: "error", message: getErrorMessage(err) });
    }
  }, [assignment, studentId, onAlreadySubmitted, startNewAttempt]);

  useEffect(() => {
    let alive = true;
    void (async () => { await bootstrap({ isAlive: () => alive }); })();
    return () => { alive = false; }; // cancellation guard
  }, [bootstrap]);

  /**
   * 5-minute and 1-minute auto-submit warnings.
   *
   * The countdown state itself lives inside MockTestApp / TestPhase — this
   * effect runs an independent wall-clock observer that fires exactly one
   * warning toast at each threshold and then sleeps. It activates only when
   * stage becomes "ready" (i.e., we've handed MockTestApp the attempt and
   * the running timer has just started), and only for timed assignments
   * with enough headroom for the threshold to be meaningful.
   *
   * Buffer rule: only fire a warning if total time > threshold + 30s, so a
   * 2-minute assignment never sees the 5-min toast and a 30-second
   * assignment never sees the 1-min toast.
   *
   * Refs prevent re-fire on remount within the same attempt; the effect
   * cleanup clears the interval when stage transitions away from "ready"
   * (e.g., on exit). We never fire when secondsLeft <= 0 — that window
   * belongs to MockTestApp's auto-submit.
   */
  useEffect(() => {
    if (stage.kind !== "ready") return;
    const totalMinutes = assignment.time_limit_minutes;
    if (!totalMinutes || totalMinutes <= 0) return; // untimed
    const totalSeconds = totalMinutes * 60;
    // Reset gates whenever a fresh attempt starts.
    fired5MinRef.current = false;
    fired1MinRef.current = false;
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const secondsLeft = totalSeconds - elapsed;
      if (secondsLeft <= 0) return; // auto-submit window — silent
      if (
        !fired5MinRef.current &&
        secondsLeft <= 300 &&
        totalSeconds > 330
      ) {
        fired5MinRef.current = true;
        toast.warning(
          "5 minutes remaining — review your answers",
          undefined,
          { durationMs: 10000 },
        );
      }
      if (
        !fired1MinRef.current &&
        secondsLeft <= 60 &&
        totalSeconds > 90
      ) {
        fired1MinRef.current = true;
        toast.warning(
          "1 minute remaining — wrap up your last answer",
          undefined,
          { durationMs: 10000 },
        );
      }
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [stage, assignment.time_limit_minutes, toast]);

  if (stage.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500 dark:text-slate-400">
        Preparing your assignment…
      </div>
    );
  }

  if (stage.kind === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Couldn't start this assignment
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {stage.message}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void bootstrap()}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage.kind === "resume-prompt") {
    const startedAtLabel = (() => {
      try {
        return new Date(stage.draftStartedAt).toLocaleString();
      } catch {
        return stage.draftStartedAt;
      }
    })();
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Resume where you left off?
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            You have an unfinished attempt for{" "}
            <span className="font-medium">{assignment.title}</span>, started{" "}
            {startedAtLabel}. Pick up the same questions, or start fresh.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500">
            Heads up: starting fresh creates a new attempt — if this
            assignment has an attempt limit, that counts against it.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={() => void resumeDraft(stage.draftAttemptId)}
              className="flex-1 min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5"
            >
              Resume attempt
            </button>
            <button
              type="button"
              onClick={() => {
                // B6: starting fresh abandons the old draft — clear its
                // crash-recovery localStorage so a stale draft doesn't
                // shadow the new attempt if the student reloads mid-mount.
                clearAssignmentDraft(stage.draftAttemptId);
                void startNewAttempt();
              }}
              className="flex-1 min-h-[40px] rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-4 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Start fresh
            </button>
          </div>
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={onExit}
              className="min-h-[40px] text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-3 py-1.5"
            >
              Back to assignments
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage.kind === "max-attempts") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            No attempts remaining
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            You've used all {stage.max} attempts for this assignment.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500">
            {assignment.title}
          </p>
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Back to assignments
            </button>
          </div>
        </div>
      </div>
    );
  }

  // stage.kind === "ready"
  // If max_attempts is configured, prefix the title with "Attempt N of M" so
  // students see their attempt count without us having to thread a new prop
  // into MockTestApp.
  const titleForRunner =
    stage.maxAttempts !== null && stage.attemptNumber !== null
      ? `Attempt ${stage.attemptNumber} of ${stage.maxAttempts} — ${assignment.title}`
      : assignment.title;
  const ctx: MockTestAssignmentContext = {
    id: assignment.id,
    attemptId: stage.attemptId,
    title: titleForRunner,
    config: buildConfig(assignment),
    // Pre-loaded questions: MockTestApp uses these directly instead of
    // re-running loadSource (which would shuffle differently and diverge
    // from the snapshot we just persisted via start_assignment_attempt).
    questions: stage.questions,
  };
  return (
    <MockTestApp
      onExit={onExit}
      userId={studentId}
      assignment={ctx}
      initialMode="assignment"
    />
  );
}
