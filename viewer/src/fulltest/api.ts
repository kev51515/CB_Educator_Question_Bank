/**
 * fulltest — API + local failsafe
 * ================================
 * Thin wrappers over the proctored full-test RPCs, with:
 *   • stable error-code → friendly-message mapping (the RPCs RAISE codes like
 *     `module_out_of_order`, `run_already_submitted`);
 *   • a localStorage answer cache so an in-progress module's answers survive a
 *     refresh/crash BEFORE they are submitted to the server (mid-module the
 *     server has no copy yet — this is the only place they live);
 *   • a small retry on the grading submit, since losing a module submission is
 *     the most costly failure.
 */
import { supabase } from "@/lib/supabase";
import type {
  GetModuleResult,
  PacingCohortRow,
  QuestionTime,
  StartTestResult,
  SubmitModuleResult,
  TestQuestion,
  TestResult,
} from "./types";

const FRIENDLY: Record<string, string> = {
  not_authenticated: "You're signed out. Please sign in again.",
  test_not_found: "That test could not be found.",
  run_not_found: "Your test session could not be found.",
  not_authorized: "This test session belongs to a different account.",
  run_already_submitted: "This test has already been submitted.",
  run_not_submitted: "Results aren't available until the test is submitted.",
  module_out_of_order: "That section isn't available yet.",
  module_not_yet_open: "That section isn't open yet.",
  module_not_deployed: "That section isn't part of this assignment.",
};

export class TestApiError extends Error {
  code: string;
  /** Postgres error DETAIL (e.g. the ISO opens_at for module_not_yet_open). */
  detail?: string;
  constructor(code: string, message?: string, detail?: string) {
    super(message ?? FRIENDLY[code] ?? code);
    this.code = code;
    this.detail = detail;
    this.name = "TestApiError";
  }
}

function mapError(
  error: { message?: string; details?: string | null; hint?: string | null } | null,
): TestApiError {
  const raw = (error?.message ?? "unknown_error").trim();
  // PostgREST surfaces a RAISE EXCEPTION 'code' as the message text.
  const code = Object.keys(FRIENDLY).find((c) => raw === c || raw.includes(c)) ?? raw;
  // RAISE ... USING DETAIL lands in supabase `error.details`.
  return new TestApiError(code, FRIENDLY[code], error?.details ?? error?.hint ?? undefined);
}

export async function startTest(
  slug: string,
  first?: number | null,
  last?: number | null,
  timeMode?: "unlimited" | "strict" | null,
): Promise<StartTestResult> {
  // first/last scope the run to a module subset (a `?m=<first>-<last>` link),
  // so the same test assigned for different modules launches independent runs
  // (0156). Omitted = the full test / metered single run (unchanged behavior).
  // timeMode (`&tm=` on the occurrence link, 0211) is frozen onto the run at
  // creation: 'strict' = clock keeps running while away; 'unlimited' (default)
  // = clock pauses. Ignored on resume (the existing run keeps its mode).
  const { data, error } = await supabase.rpc("start_test", {
    p_slug: slug,
    p_first: first ?? null,
    p_last: last ?? null,
    p_time_mode: timeMode ?? "unlimited",
  });
  if (error) throw mapError(error);
  return data as StartTestResult;
}

/**
 * Student self-pause for an 'unlimited' run (0211): freeze the section clock
 * while the student is away (tab hidden / saved-and-left), unfreeze on return —
 * the server shifts the module start forward by the away interval so no time is
 * lost. No-op server-side for a 'strict' run or a run the caller doesn't own.
 * Best-effort: never throws (fired from visibility handlers).
 */
export async function selfPause(runId: string, paused: boolean): Promise<void> {
  try {
    await supabase.rpc("test_self_pause", { p_run_id: runId, p_paused: paused });
  } catch {
    /* non-fatal — pausing is a convenience, never a blocker */
  }
}

export async function getModule(
  runId: string,
  position: number,
): Promise<GetModuleResult> {
  const { data, error } = await supabase.rpc("get_test_module", {
    p_run_id: runId,
    p_position: position,
  });
  if (error) throw mapError(error);
  return data as GetModuleResult;
}

export async function submitModule(
  runId: string,
  position: number,
  answers: Record<string, string | null>,
  eliminated: Record<string, string[]> = {},
): Promise<SubmitModuleResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.rpc("submit_test_module", {
      p_run_id: runId,
      p_position: position,
      p_answers: answers,
      p_eliminated: eliminated,
    });
    if (!error) return data as SubmitModuleResult;
    lastErr = mapError(error);
    // Non-retryable logical errors: stop immediately.
    const code = (lastErr as TestApiError).code;
    // Retry-after-success synthesis: if attempt > 0 and the server now reports
    // the module already advanced (module_out_of_order) or the run is already
    // submitted (run_already_submitted), the first attempt actually COMMITTED
    // and only the response was lost. Synthesize a success so the UI advances.
    if (attempt > 0 && (code === "module_out_of_order" || code === "run_already_submitted")) {
      return {
        finished: code === "run_already_submitted",
        next_module: position + 1,
        answered: 0,
        timed_out: false,
      } as SubmitModuleResult;
    }
    if (
      code === "run_already_submitted" ||
      code === "module_out_of_order" ||
      code === "not_authorized" ||
      code === "module_not_yet_open" ||
      code === "module_not_deployed"
    ) {
      throw lastErr;
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  throw lastErr;
}

/**
 * Persist an ungraded draft of the active module's answers server-side, so a
 * device loss mid-module doesn't lose work (durability failsafe). Best-effort:
 * a failed draft save is swallowed — the localStorage cache still holds the
 * answers and the final submit is what actually grades.
 */
export async function saveProgress(
  runId: string,
  position: number,
  answers: Record<string, string | null>,
  eliminated: Record<string, string[]> = {},
  annot: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.rpc("save_test_progress", {
      p_run_id: runId,
      p_position: position,
      p_answers: answers,
      p_eliminated: eliminated,
      p_annot: annot,
    });
  } catch {
    /* non-fatal — localStorage cache is the backup of the backup */
  }
}

/**
 * Best-effort proctoring heartbeat — tells the server which question the
 * student is viewing (+ that they're alive). Swallows all errors: telemetry
 * must never disrupt the test.
 */
export async function heartbeat(runId: string, questionNumber: number): Promise<void> {
  try {
    await supabase.rpc("test_heartbeat", { p_run_id: runId, p_question: questionNumber });
  } catch {
    /* non-fatal */
  }
}

/**
 * Proctoring level a run was started under (migration 0108 — `start_test` now
 * returns it). 'off' disables all client telemetry/enforcement; 'soft' is
 * telemetry-only (no blocking, no fullscreen requirement); 'strict' adds
 * lockdown (fullscreen requirement + copy/paste/contextmenu blocking).
 */
export type ProctoringLevel = "off" | "soft" | "strict";

/** The 10 proctor-event types accepted by `test_log_proctor_event`. */
export type ProctorEventType =
  | "away"
  | "focus_loss"
  | "fullscreen_exit"
  | "fullscreen_enter"
  | "copy"
  | "paste"
  | "copy_blocked"
  | "paste_blocked"
  | "contextmenu_blocked"
  | "devtools";

/**
 * The action-journal event types accepted by `test_log_action` (migration
 * 0124). These describe HOW a student worked the test (answer churn, flags,
 * choice eliminations, navigation/revisits) — coaching insight + in-person
 * cheating evidence — as opposed to the integrity SIGNALS above.
 */
export type ActionEventType =
  | "answer_set"
  | "answer_change"
  | "answer_clear"
  | "flag"
  | "unflag"
  | "eliminate"
  | "uneliminate"
  | "nav"
  // replay capture (0126)
  | "highlight_add"
  | "highlight_remove"
  | "highlight_clear"
  | "note_edit"
  | "calc_open"
  | "calc_close"
  | "dwell";

/** Any row that can appear on a run's timeline (integrity signal OR action). */
export type TimelineEventType = ProctorEventType | ActionEventType;

/** Optional payload carried by action events. */
export interface ActionMeta {
  /** answer_set/change/clear */
  from?: string | null;
  to?: string | null;
  /** eliminate/uneliminate */
  choice?: string | null;
  /** highlight_add/remove — "passage" | "stem" | "choice:A".."choice:D" */
  field?: string | null;
  start?: number | null;
  end?: number | null;
  offset?: number | null;
  color?: string | null;
  /** highlight_add (selected text) / note_edit (note text, capped) /
   *  copy + copy_blocked (the captured selection that was copied, capped 2000) */
  text?: string | null;
  /** copy + copy_blocked: full length of the copied selection before truncation. */
  chars?: number | null;
}

/** One row of a run's proctoring timeline (from `get_test_run_timeline`). */
export interface ProctorEvent {
  at: string;
  type: TimelineEventType;
  module: number | null;
  question: number | null;
  durationSeconds: number | null;
  meta: ActionMeta | null;
}

/**
 * Record a single proctoring event (away / focus-loss / fullscreen / copy /
 * paste / blocked attempt / devtools). Best-effort: telemetry must NEVER
 * disrupt the test, so every error — including a thrown one — is swallowed.
 */
export async function logProctorEvent(
  runId: string,
  type: ProctorEventType,
  opts: { durationSeconds?: number; module?: number; question?: number; meta?: ActionMeta } = {},
): Promise<void> {
  try {
    await supabase.rpc("test_log_proctor_event", {
      p_run_id: runId,
      p_type: type,
      p_duration_seconds: opts.durationSeconds ?? null,
      p_module: opts.module ?? null,
      p_question: opts.question ?? null,
      // The captured copy/cut selection text (0211) so the educator can see
      // exactly what was copied; null for non-copy events.
      p_meta: opts.meta ?? null,
    });
  } catch {
    /* non-fatal — proctoring telemetry is observational only */
  }
}

/**
 * Record a single action-journal event (answer set/change/clear, flag, choice
 * elimination, navigation) via `test_log_action` (migration 0124). Best-effort
 * with the same contract as logProctorEvent: telemetry must NEVER disrupt the
 * test, so every error is swallowed. Gated by the caller on proctoring_level
 * != 'off' so 'off' stays genuinely silent.
 */
export async function logAction(
  runId: string,
  type: ActionEventType,
  opts: { question?: number; module?: number; meta?: ActionMeta; durationSeconds?: number } = {},
): Promise<void> {
  try {
    await supabase.rpc("test_log_action", {
      p_run_id: runId,
      p_type: type,
      p_question: opts.question ?? null,
      p_module: opts.module ?? null,
      p_meta: opts.meta ?? null,
      p_duration_seconds: opts.durationSeconds ?? null,
    });
  } catch {
    /* non-fatal — action telemetry is observational only */
  }
}

/**
 * Fetch a run's full proctoring timeline for a teacher/monitor view. Returns
 * [] on any error (best-effort, never throws). Rows map the DB's snake_case
 * `duration_seconds` onto the camelCase `durationSeconds` field.
 */
export async function getRunTimeline(runId: string): Promise<ProctorEvent[]> {
  try {
    const { data, error } = await supabase.rpc("get_test_run_timeline", {
      p_run_id: runId,
    });
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map((row) => ({
      at: row.at as string,
      type: row.type as ProctorEventType,
      module: (row.module as number | null) ?? null,
      question: (row.question as number | null) ?? null,
      durationSeconds: (row.duration_seconds as number | null) ?? null,
      meta: (row.meta as unknown) ?? null,
    }));
  } catch {
    return [];
  }
}

// --- replay (migration 0127) ----------------------------------------------

export interface ReplayRun {
  id: string;
  status: string;
  started_at: string | null;
  submitted_at: string | null;
  current_module: number;
  proctoring_level: ProctoringLevel;
  student_id: string;
  student_name: string | null;
  test: { slug: string; title: string; short_title: string | null };
}

export interface ReplayModule {
  position: number;
  section: string;
  label: string | null;
  time_limit_seconds: number;
  question_count: number;
  questions: TestQuestion[];
}

export interface ReplayFinal {
  answers: Record<string, string | null>;
  eliminations: Record<string, string[]>;
  marks: string[];
  highlights: Record<string, unknown[]>;
  notes: Record<string, string>;
}

export interface ReplayData {
  run: ReplayRun;
  modules: ReplayModule[];
  events: ProctorEvent[];
  final: ReplayFinal;
}

/**
 * Fetch one student's sitting for the proctor REPLAY page (migration 0127):
 * run meta + every module's content + the ordered event stream + final saved
 * state. A deliberate teacher action — THROWS a TestApiError on failure so the
 * page can show an error state (unlike the best-effort telemetry helpers).
 */
export async function getRunReplay(runId: string): Promise<ReplayData> {
  const { data, error } = await supabase.rpc("get_test_run_replay", {
    p_run_id: runId,
  });
  if (error) throw mapError(error);
  const d = data as {
    run: ReplayRun;
    modules: ReplayModule[];
    events: Array<Record<string, unknown>>;
    final: ReplayFinal;
  };
  return {
    run: d.run,
    modules: d.modules ?? [],
    events: (d.events ?? []).map((row) => ({
      at: row.at as string,
      type: row.type as TimelineEventType,
      module: (row.module as number | null) ?? null,
      question: (row.question as number | null) ?? null,
      durationSeconds: (row.duration_seconds as number | null) ?? null,
      meta: (row.meta as ActionMeta | null) ?? null,
    })),
    final: d.final ?? { answers: {}, eliminations: {}, marks: [], highlights: {}, notes: {} },
  };
}

/**
 * Set a test's proctoring level (teacher-only). Unlike the telemetry helpers
 * this is a deliberate teacher action, so it THROWS on failure — the caller
 * does optimistic UI with rollback. Backed by the `set_test_proctoring_level`
 * RPC, which raises stable codes (`not_authorized`, `invalid_level`,
 * `test_not_found`, `not_authenticated`).
 */
export async function setProctoringLevel(
  slug: string,
  level: ProctoringLevel,
): Promise<void> {
  const { error } = await supabase.rpc("set_test_proctoring_level", {
    p_slug: slug,
    p_level: level,
  });
  if (error) throw error;
}

export interface RunState {
  status: string; // 'in_progress' | 'submitted' | 'abandoned'
  paused: boolean;
  current_module: number;
  seconds_remaining: number | null;
}

/** Light owner poll for status / paused / remaining (drives pause + add-time + end). */
export async function getRunState(runId: string): Promise<RunState | null> {
  try {
    const { data, error } = await supabase.rpc("test_run_state", { p_run_id: runId });
    if (error || !data) return null;
    return data as RunState;
  } catch {
    return null;
  }
}

export async function getResult(runId: string): Promise<TestResult> {
  const { data, error } = await supabase.rpc("get_test_result", {
    p_run_id: runId,
  });
  if (error) throw mapError(error);
  return data as TestResult;
}

/**
 * Per-question pacing vs. the run's class (migration 0143). One row per question
 * the student answered, with their time + the cohort average. Best-effort on the
 * caller's side (pacing is a non-critical embellishment of the review screen),
 * but THROWS here so callers can choose to swallow — keeping this wrapper
 * consistent with the deliberate-action RPCs above.
 */
export async function getQuestionTimes(runId: string): Promise<QuestionTime[]> {
  const { data, error } = await supabase.rpc("get_test_question_times", { p_run_id: runId });
  if (error) throw mapError(error);
  return (data ?? []) as QuestionTime[];
}

/**
 * Per-question pacing distribution for the teacher pace chart (migration 0187):
 * this run's time per question plus the average pace of the fastest-25% and
 * slowest-25% cohorts (course-scoped, viewer excluded). One row per question
 * that either this run or the class has dwell data for. THROWS so the caller
 * can choose to swallow — pacing is an embellishment, not a core surface.
 */
export async function getPacingCohort(runId: string): Promise<PacingCohortRow[]> {
  const { data, error } = await supabase.rpc("get_test_pacing_cohort", { p_run_id: runId });
  if (error) throw mapError(error);
  return (data ?? []) as PacingCohortRow[];
}

// --- Local answer cache (failsafe for the active, unsubmitted module) --------
const cacheKey = (runId: string, position: number) =>
  `fulltest:answers:${runId}:m${position}`;

export function loadCachedAnswers(
  runId: string,
  position: number,
): Record<string, string | null> {
  try {
    const raw = localStorage.getItem(cacheKey(runId, position));
    return raw ? (JSON.parse(raw) as Record<string, string | null>) : {};
  } catch {
    return {};
  }
}

export function saveCachedAnswers(
  runId: string,
  position: number,
  answers: Record<string, string | null>,
): void {
  try {
    localStorage.setItem(cacheKey(runId, position), JSON.stringify(answers));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

export function clearCachedAnswers(runId: string, position: number): void {
  try {
    localStorage.removeItem(cacheKey(runId, position));
  } catch {
    /* non-fatal */
  }
}

// --- staff review: per-course answer breakdown (migration 0112) -------------

/** A class the caller may review for a test, with how many students submitted. */
export interface ReviewCourse {
  course_id: string;
  title: string;
  taken: number;
}

/** One student's recorded answer to one question (latest submitted run). */
export interface BreakdownRow {
  question_id: string;
  chosen: string | null;
  is_correct: boolean | null;
  student_id: string;
  student_name: string | null;
}

/** Classes (the caller teaches; admins: all) whose Modules link this test. */
export async function listReviewCourses(slug: string): Promise<ReviewCourse[]> {
  const { data, error } = await supabase.rpc("list_test_review_courses", {
    p_slug: slug,
  });
  if (error) throw mapError(error);
  return (data ?? []) as ReviewCourse[];
}

/** Per-(question, student) answers for one class — aggregated client-side. */
export async function getAnswerBreakdown(
  slug: string,
  courseId: string,
): Promise<BreakdownRow[]> {
  const { data, error } = await supabase.rpc("get_test_answer_breakdown", {
    p_slug: slug,
    p_course_id: courseId,
  });
  if (error) throw mapError(error);
  return (data ?? []) as BreakdownRow[];
}
