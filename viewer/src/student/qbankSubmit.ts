/**
 * qbankSubmit
 * ===========
 * Shared helper that owns the qbank submission lifecycle. The submission is
 * staged to localStorage BEFORE the network call so a crash or tab close in
 * the middle of a flaky upload doesn't lose the student's work. The RPC is
 * idempotent on `p_client_attempt_id`, so retries — whether from this
 * exponential-backoff loop, the iframe-direct path in assignment-bridge.js,
 * or a "Restore" recovery on next mount — are all safe.
 *
 * State machine emitted via `onStateChange`:
 *   idle → submitting(attempt N) → success | error(canRetry|fatal)
 *
 * Two callers consume this:
 *   1. QBankAssignmentRunner — on receiving the bridge's postMessage.
 *   2. (future) on-mount recovery flow, using `listStagedSubmissions()`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type QBankSubmitState =
  | { kind: "idle" }
  | { kind: "submitting"; attempt: number }
  | { kind: "success"; attemptId: string }
  | { kind: "error"; message: string; canRetry: boolean };

export interface QBankSubmitInput {
  assignmentId: string;
  clientAttemptId: string;
  payload: Record<string, unknown>;
}

const STAGING_PREFIX = "qbank:staged:";

/**
 * Stage the submission to localStorage BEFORE attempting the network call.
 * If the tab crashes mid-submit, the next mount can recover the payload and
 * retry — the RPC dedups on `clientAttemptId`.
 */
export function stageSubmission(input: QBankSubmitInput): void {
  try {
    localStorage.setItem(
      `${STAGING_PREFIX}${input.clientAttemptId}`,
      JSON.stringify({ ...input, stagedAt: Date.now() }),
    );
  } catch {
    /* quota exceeded, private mode, etc. — proceed without staging */
  }
}

export function unstageSubmission(clientAttemptId: string): void {
  try {
    localStorage.removeItem(`${STAGING_PREFIX}${clientAttemptId}`);
  } catch {
    /* ignore */
  }
}

/**
 * Enumerate any submissions that were staged but never confirmed-delivered.
 * Called on mount so we can offer the student a "Restore" path.
 */
export function listStagedSubmissions(): QBankSubmitInput[] {
  const out: QBankSubmitInput[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STAGING_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          "assignmentId" in parsed &&
          "clientAttemptId" in parsed &&
          "payload" in parsed
        ) {
          const candidate = parsed as QBankSubmitInput;
          if (
            typeof candidate.assignmentId === "string" &&
            typeof candidate.clientAttemptId === "string" &&
            candidate.payload &&
            typeof candidate.payload === "object"
          ) {
            out.push({
              assignmentId: candidate.assignmentId,
              clientAttemptId: candidate.clientAttemptId,
              payload: candidate.payload,
            });
          }
        }
      } catch {
        /* skip malformed entry */
      }
    }
  } catch {
    /* localStorage unavailable */
  }
  return out;
}

interface RpcErrorLike {
  code?: string;
  message?: string;
}

/**
 * Fatal PostgreSQL SQLSTATE codes the RPC may raise. These represent
 * unrecoverable conditions (auth, max attempts, wrong assignment kind) where
 * retrying would just produce the same answer. Any other code is treated as
 * transient and goes through the backoff loop.
 */
const FATAL_CODES = new Set(["42501", "22023", "22000", "02000", "28000"]);

/**
 * Map a raw RPC error message to the canonical result_code the backend
 * audit table expects. Falls back to "unknown_error" so the row still lands.
 *
 * Mirrors the error codes raised by submit_qbank_attempt in migration 0047:
 *   not_authenticated | not_enrolled | max_attempts_reached |
 *   assignment_not_found | wrong_kind | invalid_payload
 */
function extractResultCode(rawMessage: string): string {
  const m = rawMessage || "";
  if (m.includes("not_authenticated")) return "not_authenticated";
  if (m.includes("not_enrolled")) return "not_enrolled";
  if (m.includes("max_attempts_reached")) return "max_attempts_reached";
  if (m.includes("assignment_not_found")) return "assignment_not_found";
  if (m.includes("wrong_kind")) return "wrong_kind";
  if (m.includes("invalid_payload")) return "invalid_payload";
  return "unknown_error";
}

/**
 * Persist a failure row to qbank_submission_log via the dedicated RPC.
 *
 * Why a separate RPC: PostgreSQL doesn't have autonomous transactions, so
 * logging from INSIDE submit_qbank_attempt before a RAISE gets rolled back
 * with the parent transaction (see migration 0047 header). The CLIENT
 * calling a second RPC after the failure runs in its own transaction, so
 * the audit row actually persists.
 *
 * Best-effort: any logging failure is swallowed so it can't compound a
 * submission failure with a confusing secondary error.
 */
async function logFailure(
  supabase: SupabaseClient,
  input: QBankSubmitInput,
  resultCode: string,
  errorMessage: string,
): Promise<void> {
  try {
    await supabase.rpc("log_qbank_failure", {
      p_assignment_id: input.assignmentId,
      p_client_attempt_id: input.clientAttemptId,
      p_payload: input.payload,
      p_result_code: resultCode,
      p_error_message: errorMessage.slice(0, 4000),
    });
  } catch {
    /* never let a logging failure poison the real error path */
  }
}

function mapErrorMessage(rawMessage: string, code: string): string {
  const raw = rawMessage || "";
  if (raw.includes("not_authenticated"))
    return "Your session expired. Please sign in again.";
  if (raw.includes("not_enrolled"))
    return "You are not enrolled in this course.";
  if (raw.includes("max_attempts_reached"))
    return "You have already used all your attempts.";
  if (raw.includes("assignment_not_found"))
    return "This test is no longer available.";
  if (raw.includes("invalid_payload"))
    return "Your submission looked malformed. Please try retaking the test.";
  if (raw.includes("wrong_kind"))
    return "This assignment isn't a question-bank set anymore.";
  return `Submission error (${code || "unknown"}). Your answers are saved locally.`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit with exponential backoff: 500ms, 1s, 2s, 4s, 8s between attempts.
 * The same `clientAttemptId` is reused across attempts AND across the
 * iframe-direct channel in assignment-bridge.js, so the RPC's dedup
 * guarantees we never double-write.
 */
export async function submitWithRetry(
  supabase: SupabaseClient,
  input: QBankSubmitInput,
  onStateChange: (state: QBankSubmitState) => void,
  maxAttempts = 5,
): Promise<{ attemptId: string }> {
  stageSubmission(input);
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onStateChange({ kind: "submitting", attempt });
    try {
      const { data, error } = await supabase.rpc("submit_qbank_attempt", {
        p_assignment_id: input.assignmentId,
        p_client_attempt_id: input.clientAttemptId,
        p_payload: input.payload,
      });

      if (error) {
        const rpcError = error as RpcErrorLike;
        const code = rpcError.code ?? "";
        const message = rpcError.message ?? "";
        const fatalByCode = FATAL_CODES.has(code);
        const fatalByMessage =
          message.includes("not_authenticated") ||
          message.includes("not_enrolled") ||
          message.includes("max_attempts_reached") ||
          message.includes("assignment_not_found") ||
          message.includes("wrong_kind") ||
          message.includes("invalid_payload");

        if (fatalByCode || fatalByMessage) {
          const friendly = mapErrorMessage(message, code);
          // Fatal: log to audit table (separate tx — parent RPC rolled back
          // its own log row) BEFORE we unstage and surface the error.
          await logFailure(supabase, input, extractResultCode(message), message);
          // Fatal: unstage so we don't keep nagging the student on reload.
          unstageSubmission(input.clientAttemptId);
          onStateChange({ kind: "error", message: friendly, canRetry: false });
          throw new Error(friendly);
        }

        lastError = message || "Unknown RPC error";
        if (attempt < maxAttempts) {
          await delay(500 * 2 ** (attempt - 1));
          continue;
        }
        // Exhausted retries on a transient-looking error — still log it.
        await logFailure(
          supabase,
          input,
          extractResultCode(message),
          `retries_exhausted: ${lastError}`,
        );
        const friendly = `Couldn't submit after ${maxAttempts} tries — your work is saved locally. Click Retry.`;
        onStateChange({ kind: "error", message: friendly, canRetry: true });
        throw new Error(friendly);
      }

      const attemptId =
        typeof data === "string" ? data : String(data ?? input.clientAttemptId);
      onStateChange({ kind: "success", attemptId });
      unstageSubmission(input.clientAttemptId);
      return { attemptId };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        await delay(500 * 2 ** (attempt - 1));
        continue;
      }
    }
  }

  const friendly = `Network error after ${maxAttempts} tries — your work is saved locally. Click Retry.`;
  onStateChange({ kind: "error", message: friendly, canRetry: true });
  throw new Error(lastError || friendly);
}
