/**
 * useQBankLog
 * ===========
 * Reads recent qbank submission attempts from the audit table
 * `qbank_submission_log` (migration 0046).
 *
 * Why this hook exists
 * --------------------
 * Every call to the `submit_qbank_attempt` RPC writes a row here — both on
 * success and on failure. RLS lets staff read all rows (students see only
 * their own). The teacher-facing recovery surface
 * (`QBankSubmissionLogPage`) uses this hook to surface failures and let a
 * teacher replay them.
 *
 * Joins
 * -----
 * We embed `assignments(title, course_id, courses(name))` for display, and
 * `profiles!qbank_submission_log_student_id_fkey(display_name, email)` for
 * the student. PostgREST handles the nested resource path; if either side
 * is missing (e.g. an assignment was deleted), we fall back to dashes in
 * the UI without crashing.
 *
 * `score_percent` is extracted from `payload.scorePercent` (the submission
 * envelope built by the bank bridge) so the table can show a quick number
 * without an extra round-trip to `qbank_attempts`.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface QBankLogEntry {
  id: number;
  assignment_id: string;
  assignment_title: string;
  course_id: string;
  course_name: string;
  student_id: string;
  student_name: string;
  student_email: string;
  client_attempt_id: string | null;
  attempt_id: string | null;
  payload: Record<string, unknown>;
  result_code: string;
  error_message: string | null;
  created_at: string;
  /** Pulled from payload.scorePercent for quick at-a-glance display. */
  score_percent: number | null;
}

export interface UseQBankLogOptions {
  /** Restrict to a single course (by course id). Null/undefined → all courses. */
  courseId?: string | null;
  /** When true, hide success rows and show only error / max_attempts / etc. */
  failuresOnly?: boolean;
}

export interface UseQBankLog {
  entries: QBankLogEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface LogRow {
  id: number;
  assignment_id: string;
  student_id: string;
  client_attempt_id: string | null;
  attempt_id: string | null;
  payload: Record<string, unknown> | null;
  result_code: string;
  error_message: string | null;
  created_at: string;
  assignment: {
    title: string | null;
    course_id: string | null;
    course: { name: string | null } | null;
  } | null;
  student: {
    display_name: string | null;
    email: string | null;
  } | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load submission log.";
}

/**
 * Pull a numeric `scorePercent` out of the JSONB payload if present. The
 * student-side bank ships `scorePercent`, `score_percent`, or sometimes a
 * nested `result.scorePercent` depending on bank version — try each.
 */
function extractScore(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  const direct = payload["scorePercent"] ?? payload["score_percent"];
  if (typeof direct === "number") return direct;
  const result = payload["result"];
  if (result && typeof result === "object") {
    const nested = (result as Record<string, unknown>)["scorePercent"];
    if (typeof nested === "number") return nested;
  }
  return null;
}

const SUCCESS_CODES = new Set(["success", "success_idempotent"]);

export function useQBankLog(options: UseQBankLogOptions = {}): UseQBankLog {
  const { courseId, failuresOnly } = options;
  const [entries, setEntries] = useState<QBankLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Embed assignment + course + student. The explicit FK hint after
      // `profiles` keeps PostgREST from getting confused if multiple FKs
      // exist (mirrors the pattern in useAssignmentAttempts).
      const { data, error: queryError } = await supabase
        .from("qbank_submission_log")
        .select(
          "id, assignment_id, student_id, client_attempt_id, attempt_id, payload, result_code, error_message, created_at, assignment:assignments(title, course_id, course:courses(name)), student:profiles!qbank_submission_log_student_id_fkey(display_name, email)",
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (queryError) {
        setEntries([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as LogRow[];
      let mapped: QBankLogEntry[] = rows.map((row) => ({
        id: row.id,
        assignment_id: row.assignment_id,
        assignment_title: row.assignment?.title ?? "—",
        course_id: row.assignment?.course_id ?? "",
        course_name: row.assignment?.course?.name ?? "—",
        student_id: row.student_id,
        student_name: row.student?.display_name ?? "",
        student_email: row.student?.email ?? "",
        client_attempt_id: row.client_attempt_id,
        attempt_id: row.attempt_id,
        payload: row.payload ?? {},
        result_code: row.result_code,
        error_message: row.error_message,
        created_at: row.created_at,
        score_percent: extractScore(row.payload),
      }));

      if (courseId) {
        mapped = mapped.filter((e) => e.course_id === courseId);
      }
      if (failuresOnly) {
        mapped = mapped.filter((e) => !SUCCESS_CODES.has(e.result_code));
      }

      setEntries(mapped);
    } catch (err: unknown) {
      setEntries([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId, failuresOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, loading, error, refresh };
}
