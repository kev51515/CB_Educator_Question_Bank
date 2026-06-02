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
import { supabase } from "../lib/supabase";
import type {
  GetModuleResult,
  StartTestResult,
  SubmitModuleResult,
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
};

export class TestApiError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? FRIENDLY[code] ?? code);
    this.code = code;
    this.name = "TestApiError";
  }
}

function mapError(error: { message?: string } | null): TestApiError {
  const raw = (error?.message ?? "unknown_error").trim();
  // PostgREST surfaces a RAISE EXCEPTION 'code' as the message text.
  const code = Object.keys(FRIENDLY).find((c) => raw === c || raw.includes(c)) ?? raw;
  return new TestApiError(code, FRIENDLY[code]);
}

export async function startTest(slug: string): Promise<StartTestResult> {
  const { data, error } = await supabase.rpc("start_test", { p_slug: slug });
  if (error) throw mapError(error);
  return data as StartTestResult;
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
    if (
      code === "run_already_submitted" ||
      code === "module_out_of_order" ||
      code === "not_authorized"
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
): Promise<void> {
  try {
    await supabase.rpc("save_test_progress", {
      p_run_id: runId,
      p_position: position,
      p_answers: answers,
      p_eliminated: eliminated,
    });
  } catch {
    /* non-fatal — localStorage cache is the backup of the backup */
  }
}

export async function getResult(runId: string): Promise<TestResult> {
  const { data, error } = await supabase.rpc("get_test_result", {
    p_run_id: runId,
  });
  if (error) throw mapError(error);
  return data as TestResult;
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
