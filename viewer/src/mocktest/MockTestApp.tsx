/**
 * MockTestApp — top-level orchestrator for the mock test surface.
 *
 * State machine:
 *   "setup"     → student picks source/count/time, then we transition to "loading"
 *   "loading"   → fetching the chosen source's questions
 *   "running"   → TestPhase is rendered; answers/flags/index are owned here
 *   "submitted" → TestResults
 *
 * Two modes:
 *   - Free practice (`assignment` prop NOT provided): the existing behaviour.
 *     The full session is mirrored to `localStorage` under
 *     `mocktest.session:<userId>` so a reload resumes the student where they
 *     left off. The snapshot is cleared on submit / reset / exit so a returning
 *     student isn't surprised with a stale test.
 *   - Assignment mode (`assignment` prop provided): skips the TestSetup phase
 *     entirely, mounts straight into `loading` with the assignment's config,
 *     and persists the FINAL result to `assignment_attempts` on submit.
 *
 *     Crash-recovery (B6): assignment-mode also mirrors mid-attempt state
 *     (answers/flagged/currentIndex) to a per-attempt localStorage entry
 *     keyed on attempt id:
 *         `mocktest.assignment.<attemptId>.state`
 *     The DB is still the source of truth for the FINAL submission, but
 *     this localStorage entry lets a closed-tab / reloaded student resume
 *     where they left off without the AssignmentRunner having to wire a
 *     per-question persistence RPC. AssignmentRunner can also pass
 *     server-side hydration (resumedAnswers / resumedFlagged /
 *     resumedCurrentIndex) which takes precedence — localStorage only fills
 *     in when those props aren't supplied (or are empty).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BreakScreen } from "./components/BreakScreen";
import { TestPhase } from "./components/TestPhase";
import { TestResults } from "./components/TestResults";
import { TestSetup } from "./components/TestSetup";
import { computeTestResult } from "./components/resultsHelpers";
import { loadSource } from "./sources";
import { supabase } from "@/lib/supabase";
import type {
  Letter,
  TestConfig,
  TestQuestion,
  TestResult,
  TestSession,
} from "./types";

export interface MockTestAssignmentContext {
  /** assignment row id. */
  id: string;
  /** assignment_attempts row id — already created before mounting. */
  attemptId: string;
  /** Shown in the header. */
  title: string;
  /** Pre-built TestConfig derived from the assignment row. */
  config: TestConfig;
  /**
   * Pre-loaded question pool. As of migration 0014 the AssignmentRunner
   * builds this client-side via `loadSource(config)`, hands it to the
   * `start_assignment_attempt` RPC for snapshotting, and then passes the
   * same array here so MockTestApp doesn't re-shuffle. When omitted (legacy
   * callers / tests), MockTestApp falls back to `loadSource(config)`.
   */
  questions?: TestQuestion[];
}

interface MockTestAppProps {
  onExit: () => void;
  /** Optional per-user storage key suffix so different students don't share state. */
  userId?: string;
  /** When set, MockTestApp runs in assignment mode. */
  assignment?: MockTestAssignmentContext;
  /** Default is "free" if not provided. */
  initialMode?: "free" | "assignment";
  /**
   * Assignment-mode-only hydration props (B6 resume). When provided AND
   * `assignment` is set, MockTestApp will initialise the running answer
   * state from these instead of starting empty. The caller (AssignmentRunner)
   * is the source of truth at mount time — these REPLACE any in-memory or
   * localStorage state.
   *
   * Pass an empty object / empty set / 0 (or just omit) for a fresh start.
   */
  resumedAnswers?: Record<string, Letter | null>;
  resumedFlagged?: ReadonlySet<string>;
  resumedCurrentIndex?: number;
  /**
   * Assignment-mode live progress: fires with the 1-based question NUMBER the
   * student is currently on (on mount + every navigation). AssignmentRunner uses
   * it to post a heartbeat so the teacher Monitor shows live position.
   */
  onProgress?: (questionNumber: number) => void;
}

type Phase = "setup" | "loading" | "running" | "submitted";

interface RunningState {
  sessionId: string;
  startedAt: number;
  config: TestConfig;
  questions: TestQuestion[];
  answers: Record<string, Letter | null>;
  flagged: string[];
  currentIndex: number;
}

interface SubmittedState {
  sessionId: string;
  result: TestResult;
  questions: TestQuestion[];
  answers: Record<string, Letter | null>;
}

const STORAGE_KEY_PREFIX = "mocktest.session";

function storageKey(userId: string | undefined): string {
  return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : STORAGE_KEY_PREFIX;
}

/**
 * B6 — per-attempt crash-recovery key for assignment mode. Distinct
 * namespace from free-mode (`mocktest.session:*`) so a teacher's free
 * practice can't accidentally hydrate as someone's assignment.
 */
function assignmentDraftKey(attemptId: string): string {
  return `mocktest.assignment.${attemptId}.state`;
}

interface AssignmentDraft {
  answers: Record<string, Letter | null>;
  flagged: ReadonlyArray<string>;
  currentIndex: number;
  savedAt: number;
}

function readAssignmentDraft(attemptId: string): AssignmentDraft | null {
  try {
    const raw = localStorage.getItem(assignmentDraftKey(attemptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AssignmentDraft> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.answers || typeof parsed.answers !== "object") return null;
    const flagged = Array.isArray(parsed.flagged) ? parsed.flagged : [];
    const currentIndex =
      typeof parsed.currentIndex === "number" ? parsed.currentIndex : 0;
    return {
      answers: parsed.answers as Record<string, Letter | null>,
      flagged,
      currentIndex,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeAssignmentDraft(attemptId: string, state: RunningState): void {
  try {
    const draft: AssignmentDraft = {
      answers: state.answers,
      flagged: state.flagged,
      currentIndex: state.currentIndex,
      savedAt: Date.now(),
    };
    localStorage.setItem(assignmentDraftKey(attemptId), JSON.stringify(draft));
  } catch {
    // quota / private mode — fail silent; server has the final submission
  }
}

export function clearAssignmentDraft(attemptId: string): void {
  try {
    localStorage.removeItem(assignmentDraftKey(attemptId));
  } catch {
    // no-op
  }
}

function makeSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isLetter(value: unknown): value is Letter {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function readPersistedRunning(userId: string | undefined): RunningState | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TestSession> | null;
    if (!parsed || !Array.isArray(parsed.questions)) return null;
    if (parsed.submittedAt) return null;
    if (!parsed.id || !parsed.startedAt || !parsed.config) return null;
    return {
      sessionId: parsed.id,
      startedAt: parsed.startedAt,
      config: parsed.config,
      questions: parsed.questions as TestQuestion[],
      answers: (parsed.answers ?? {}) as Record<string, Letter | null>,
      flagged: Array.isArray(parsed.flagged) ? [...parsed.flagged] : [],
      currentIndex: typeof parsed.currentIndex === "number" ? parsed.currentIndex : 0,
    };
  } catch {
    return null;
  }
}

function writePersistedRunning(userId: string | undefined, state: RunningState | null): void {
  try {
    if (!state) {
      localStorage.removeItem(storageKey(userId));
      return;
    }
    const snapshot: TestSession = {
      id: state.sessionId,
      startedAt: state.startedAt,
      config: state.config,
      questions: state.questions,
      answers: state.answers,
      flagged: state.flagged,
      currentIndex: state.currentIndex,
      submittedAt: null,
    };
    localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch {
    // quota errors are non-fatal — the test just won't survive a reload.
  }
}

export function MockTestApp({
  onExit,
  userId,
  assignment,
  initialMode,
  resumedAnswers,
  resumedFlagged,
  resumedCurrentIndex,
  onProgress,
}: MockTestAppProps) {
  // Why a ref-derived flag: assignment mode skips setup entirely and writes
  // to the DB on submit. Free mode keeps the original localStorage flow.
  const isAssignment =
    assignment !== undefined || initialMode === "assignment";

  const [phase, setPhase] = useState<Phase>(isAssignment ? "loading" : "setup");
  const [running, setRunning] = useState<RunningState | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  /**
   * Build a RunningState from a config + an already-resolved question pool.
   * Extracted so both the free-mode start (loadSource here) and the
   * assignment-mode preloaded path can share the answers/flags init.
   *
   * Optional `seed` lets the assignment-mode caller hydrate the answer
   * state from a server-side or localStorage source (B6 resume). Seeded
   * answers/flagged are intersected with the actual question pool so a
   * stale draft (e.g. questions reshuffled by an admin) doesn't surface
   * answers for questions that don't exist anymore.
   */
  const mountRunning = useCallback(
    (
      config: TestConfig,
      questions: TestQuestion[],
      seed?: {
        answers?: Record<string, Letter | null>;
        flagged?: ReadonlyArray<string> | ReadonlySet<string>;
        currentIndex?: number;
      },
    ) => {
      const questionIds = new Set(questions.map((q) => q.id));
      const initialAnswers: Record<string, Letter | null> = {};
      for (const q of questions) {
        const seeded = seed?.answers?.[q.id];
        initialAnswers[q.id] = isLetter(seeded) ? seeded : null;
      }
      const seedFlaggedArr =
        seed?.flagged instanceof Set
          ? [...seed.flagged]
          : Array.isArray(seed?.flagged)
            ? (seed?.flagged as string[])
            : [];
      const initialFlagged = seedFlaggedArr.filter((id) => questionIds.has(id));
      const initialIndex = Math.max(
        0,
        Math.min(questions.length - 1, seed?.currentIndex ?? 0),
      );
      const newRunning: RunningState = {
        sessionId: makeSessionId(),
        startedAt: Date.now(),
        config,
        questions,
        answers: initialAnswers,
        flagged: initialFlagged,
        currentIndex: initialIndex,
      };
      setRunning(newRunning);
      setPhase("running");
    },
    [],
  );

  const handleStart = useCallback(
    async (config: TestConfig) => {
      setLoadError(null);
      setPhase("loading");
      try {
        const questions = await loadSource(config);
        if (questions.length === 0) {
          setLoadError(
            "No questions matched your configuration. Try a different difficulty or source.",
          );
          // In assignment mode there's no setup screen to fall back to —
          // surface the error inline on the loading screen.
          setPhase(isAssignment ? "loading" : "setup");
          return;
        }
        mountRunning(config, questions);
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load questions. Please try again.";
        setLoadError(message);
        setPhase(isAssignment ? "loading" : "setup");
      }
    },
    [isAssignment, mountRunning],
  );

  // Restore persisted in-progress test on mount. For assignment mode the
  // DB is the source of truth for the FINAL submission; for resume, seed
  // order is: (1) explicit resumed* props from caller, (2) per-attempt
  // localStorage draft, (3) empty. Free mode keeps its own session key.
  useEffect(() => {
    if (isAssignment) {
      if (assignment) {
        // Resolve seed: caller props beat localStorage; both can be absent.
        const hasResumeProps =
          resumedAnswers !== undefined ||
          (resumedFlagged !== undefined && resumedFlagged.size > 0) ||
          (resumedCurrentIndex !== undefined && resumedCurrentIndex > 0);
        let seed:
          | {
              answers?: Record<string, Letter | null>;
              flagged?: ReadonlyArray<string> | ReadonlySet<string>;
              currentIndex?: number;
            }
          | undefined;
        if (hasResumeProps) {
          seed = {
            answers: resumedAnswers,
            flagged: resumedFlagged,
            currentIndex: resumedCurrentIndex,
          };
        } else {
          const draft = readAssignmentDraft(assignment.attemptId);
          if (draft) {
            seed = {
              answers: draft.answers,
              flagged: draft.flagged,
              currentIndex: draft.currentIndex,
            };
          }
        }
        if (assignment.questions && assignment.questions.length > 0) {
          mountRunning(assignment.config, assignment.questions, seed);
        } else {
          void handleStart(assignment.config);
        }
      }
      return;
    }
    const persisted = readPersistedRunning(userId);
    if (persisted) {
      setRunning(persisted);
      setPhase("running");
    }
    // We only want this to run on mount; handleStart identity is stable per
    // isAssignment + the assignment.config snapshot supplied at mount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change to the running state. Free mode mirrors to
  // `mocktest.session:<userId>`; assignment mode mirrors to
  // `mocktest.assignment.<attemptId>.state` so a closed tab can resume
  // without burning a server-side per-question write.
  useEffect(() => {
    if (phase !== "running" || !running) return;
    if (isAssignment && assignment) {
      writeAssignmentDraft(assignment.attemptId, running);
    } else if (!isAssignment) {
      writePersistedRunning(userId, running);
    }
  }, [phase, running, userId, isAssignment, assignment]);

  // Assignment-mode live progress → heartbeat. Fires on mount + every nav.
  const currentQuestionNumber =
    running && phase === "running" ? running.currentIndex + 1 : null;
  useEffect(() => {
    if (!isAssignment || !onProgress || currentQuestionNumber == null) return;
    onProgress(currentQuestionNumber);
  }, [isAssignment, onProgress, currentQuestionNumber]);

  const handleAnswer = useCallback((questionId: string, letter: Letter) => {
    setRunning((prev) => {
      if (!prev) return prev;
      const current = prev.answers[questionId];
      if (current === letter) return prev;
      if (!isLetter(letter)) return prev;
      return { ...prev, answers: { ...prev.answers, [questionId]: letter } };
    });
  }, []);

  const handleGoTo = useCallback((idx: number) => {
    setRunning((prev) => {
      if (!prev) return prev;
      const clamped = Math.max(0, Math.min(prev.questions.length - 1, idx));
      if (clamped === prev.currentIndex) return prev;
      return { ...prev, currentIndex: clamped };
    });
  }, []);

  const handleToggleFlag = useCallback((questionId: string) => {
    setRunning((prev) => {
      if (!prev) return prev;
      const has = prev.flagged.includes(questionId);
      return {
        ...prev,
        flagged: has
          ? prev.flagged.filter((id) => id !== questionId)
          : [...prev.flagged, questionId],
      };
    });
  }, []);

  /**
   * Persist an assignment attempt result to Supabase. Returns null on success.
   *
   * Post-0014 we no longer inline the question pool into result_detail —
   * the `assignment_attempt_questions` snapshot table is the source of
   * truth and is populated atomically by `start_assignment_attempt`. The
   * `questions` parameter is still accepted for symmetry / future use but
   * is intentionally NOT written here.
   */
  const persistAssignmentResult = useCallback(
    async (
      attemptId: string,
      result: TestResult,
      _questions: TestQuestion[],
      answers: Record<string, Letter | null>,
    ): Promise<string | null> => {
      void _questions;
      const { error } = await supabase
        .from("assignment_attempts")
        .update({
          submitted_at: new Date().toISOString(),
          score_percent: result.scorePercent,
          correct_count: result.correctCount,
          total_questions: result.totalQuestions,
          duration_seconds: result.durationSeconds,
          answers,
          result_detail: result,
        })
        .eq("id", attemptId);
      if (error) return error.message;
      return null;
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    setRunning((prev) => {
      if (!prev) return prev;
      const submittedAt = Date.now();
      const result = computeTestResult(
        prev.questions,
        prev.answers,
        prev.startedAt,
        submittedAt,
      );
      setSubmitted({
        sessionId: prev.sessionId,
        result,
        questions: prev.questions,
        answers: prev.answers,
      });
      setPhase("submitted");
      if (!isAssignment) {
        writePersistedRunning(userId, null);
      }
      // Persist to DB in assignment mode.
      if (isAssignment && assignment) {
        // Clear the crash-recovery draft as soon as the student commits to
        // submit — the DB is now the source of truth. We do this before
        // the network round-trip so a flaky submit doesn't leave a stale
        // draft that would re-hydrate on retry.
        clearAssignmentDraft(assignment.attemptId);
        setSaveStatus("saving");
        setSaveError(null);
        void (async () => {
          const err = await persistAssignmentResult(
            assignment.attemptId,
            result,
            prev.questions,
            prev.answers,
          );
          if (err) {
            setSaveError(err);
            setSaveStatus("idle");
          } else {
            setSaveStatus("saved");
          }
        })();
      }
      return null;
    });
  }, [isAssignment, assignment, persistAssignmentResult, userId]);

  const handleRetrySave = useCallback(() => {
    if (!isAssignment || !assignment || !submitted) return;
    setSaveStatus("saving");
    setSaveError(null);
    void (async () => {
      const err = await persistAssignmentResult(
        assignment.attemptId,
        submitted.result,
        submitted.questions,
        submitted.answers,
      );
      if (err) {
        setSaveError(err);
        setSaveStatus("idle");
      } else {
        setSaveStatus("saved");
      }
    })();
  }, [isAssignment, assignment, submitted, persistAssignmentResult]);

  const handleRetake = useCallback(() => {
    // In assignment mode, retaking is not a free-form re-setup; we just
    // exit back to the assignment selector. The student would need to
    // restart from AreaSelector → Restart for a new run.
    if (isAssignment) {
      onExit();
      return;
    }
    setSubmitted(null);
    setLoadError(null);
    setPhase("setup");
  }, [isAssignment, onExit]);

  const handleExitFromResults = useCallback(() => {
    setSubmitted(null);
    setSaveStatus("idle");
    setSaveError(null);
    setPhase(isAssignment ? "loading" : "setup");
    onExit();
  }, [isAssignment, onExit]);

  const handleExitFromSetup = useCallback(() => {
    // exiting clears any persisted state so the orchestrator starts clean next time
    writePersistedRunning(userId, null);
    onExit();
  }, [onExit, userId]);

  const flaggedSet = useMemo(
    () => new Set(running?.flagged ?? []),
    [running?.flagged],
  );

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {loadError && (
          <div className="max-w-2xl mx-auto pt-6 px-4">
            <p
              role="alert"
              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
            >
              {loadError}
            </p>
          </div>
        )}
        <TestSetup onStart={handleStart} onExit={handleExitFromSetup} />
      </div>
    );
  }

  if (phase === "loading") {
    // In assignment mode, surface load errors here with a way out.
    if (loadError && isAssignment) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Couldn't load this assignment
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {loadError}
            </p>
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
            >
              Back
            </button>
          </div>
        </div>
      );
    }
    return (
      <BreakScreen
        title="Loading test…"
        message="Pulling fresh questions from your source."
      />
    );
  }

  if (phase === "running" && running) {
    const totalSeconds =
      running.config.timeLimitMinutes > 0
        ? running.config.timeLimitMinutes * 60
        : 0;
    const sourceLabel = assignment
      ? `Assignment: ${assignment.title}`
      : running.config.sourceId === "cb"
        ? "College Board Mock Test"
        : running.config.sourceId === "sat"
          ? "AI SAT Mock Test"
          : "Mixed Mock Test";
    return (
      <TestPhase
        sessionId={running.sessionId}
        label={sourceLabel}
        questions={running.questions}
        currentIdx={running.currentIndex}
        answers={running.answers}
        flagged={flaggedSet}
        totalSeconds={totalSeconds}
        onAnswer={handleAnswer}
        onGoTo={handleGoTo}
        onToggleFlag={handleToggleFlag}
        onSubmit={handleSubmit}
      />
    );
  }

  if (phase === "submitted" && submitted) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {isAssignment && assignment && (
          <div className="max-w-2xl mx-auto px-4 pt-4">
            {saveStatus === "saving" && (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                Saving to {assignment.title}…
              </p>
            )}
            {saveStatus === "saved" && (
              <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Saved to {assignment.title}.
              </p>
            )}
            {saveError && (
              <div
                role="alert"
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300 flex items-center justify-between gap-3"
              >
                <span>Couldn't save your attempt: {saveError}</span>
                <button
                  type="button"
                  onClick={handleRetrySave}
                  className="shrink-0 rounded-md bg-rose-600 hover:bg-rose-700 px-2.5 py-1 text-xs font-medium text-white"
                >
                  Retry save
                </button>
              </div>
            )}
          </div>
        )}
        <TestResults
          result={submitted.result}
          questions={submitted.questions}
          answers={submitted.answers}
          onRetake={handleRetake}
          onClose={handleExitFromResults}
        />
      </div>
    );
  }

  // Defensive fallback: nothing valid to render → kick back to setup or exit.
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <button
        type="button"
        onClick={isAssignment ? onExit : handleRetake}
        className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-white text-sm font-medium"
      >
        {isAssignment ? "Back" : "Restart Setup"}
      </button>
    </div>
  );
}
