/**
 * Shared helpers for reading + rendering a persisted assignment_attempts row.
 *
 * Why this exists: both StudentAttemptReview and TeacherAttemptDetailView load
 * the same row shape (with `result_detail` + `answers`) and render the same
 * per-question rationale UI. Centralising the parsing + a few formatters here
 * keeps the two views thin and consistent.
 *
 * Snapshot source (post-0014): the question pool the student saw is stored
 * in the `assignment_attempt_questions` table and fetched via the
 * `fetch_attempt_questions` RPC. `result_detail` no longer carries an
 * inlined `questions` array — we read it from the RPC and merge the result.
 */
import { supabase } from "./supabase";
import type {
  Letter,
  TestQuestion,
  TestResult,
} from "@/mocktest/types";

export interface AttemptReviewData {
  attemptId: string;
  assignmentId: string;
  studentId: string;
  studentDisplayName: string | null;
  studentEmail: string;
  assignmentTitle: string;
  startedAt: string;
  submittedAt: string | null;
  scorePercent: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
  durationSeconds: number | null;
  result: TestResult | null;
  questions: TestQuestion[];
  answers: Record<string, Letter | null>;
  // 0053 grading persistence — nullable until a teacher has touched them.
  feedbackText: string | null;
  scoreOverride: number | null;
  gradedAt: string | null;
  graderId: string | null;
  /**
   * Convenience-computed `COALESCE(score_override, score_percent)`. Mirrors
   * the `assignment_attempts_effective` view's `effective_score`. Surfaces
   * (ScoreHero, gradebook cells, attempt lists) should prefer this for
   * display so a teacher's override actually reaches the student.
   */
  effectiveScore: number | null;
}

interface AttemptRow {
  id: string;
  assignment_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  score_percent: number | string | null;
  correct_count: number | null;
  total_questions: number | null;
  duration_seconds: number | null;
  result_detail: unknown;
  answers: unknown;
  feedback_text: string | null;
  score_override: number | string | null;
  graded_at: string | null;
  grader_id: string | null;
  assignments: { title: string } | null;
  student: { display_name: string | null; email: string } | null;
}

function isLetter(value: unknown): value is Letter {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function parseAnswers(raw: unknown): Record<string, Letter | null> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Letter | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null) {
      out[k] = null;
    } else if (isLetter(v)) {
      out[k] = v;
    }
  }
  return out;
}

function parseQuestionsFromRpc(raw: unknown): TestQuestion[] {
  if (!Array.isArray(raw)) return [];
  // We trust the snapshot shape; if a future migration changes it we want
  // loud failures in dev rather than silent data loss.
  return raw as TestQuestion[];
}

function parseResult(raw: unknown): TestResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.totalQuestions !== "number" ||
    typeof r.correctCount !== "number" ||
    typeof r.scorePercent !== "number" ||
    typeof r.durationSeconds !== "number" ||
    !Array.isArray(r.byDomain) ||
    !Array.isArray(r.bySkill) ||
    !Array.isArray(r.byDifficulty)
  ) {
    return null;
  }
  return {
    totalQuestions: r.totalQuestions,
    correctCount: r.correctCount,
    scorePercent: r.scorePercent,
    durationSeconds: r.durationSeconds,
    byDomain: r.byDomain as TestResult["byDomain"],
    bySkill: r.bySkill as TestResult["bySkill"],
    byDifficulty: r.byDifficulty as TestResult["byDifficulty"],
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load attempt.";
}

/**
 * Fetch a single attempt by id, joined with assignment title + student
 * profile. RLS scopes this to the owning student (or the teacher of the
 * assignment's class), so the same call works from both surfaces.
 */
export async function fetchAttemptReview(
  attemptId: string,
): Promise<{ data: AttemptReviewData | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("assignment_attempts")
      .select(
        "id, assignment_id, student_id, started_at, submitted_at, score_percent, correct_count, total_questions, duration_seconds, result_detail, answers, feedback_text, score_override, graded_at, grader_id, assignments:assignments!assignment_attempts_assignment_id_fkey(title), student:profiles!assignment_attempts_student_id_fkey(display_name, email)",
      )
      .eq("id", attemptId)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }
    if (!data) {
      return { data: null, error: "Attempt not found." };
    }
    const row = data as unknown as AttemptRow;
    const result = parseResult(row.result_detail);
    // Post-0014 the question snapshot lives in assignment_attempt_questions
    // and is fetched via fetch_attempt_questions. We swallow RPC errors into
    // an empty array so the review still renders the score / breakdowns
    // when the snapshot is absent (legacy attempts that pre-date the
    // backfill, or the rare case where a teacher's deletion races us).
    const { data: rpcQuestions } = await supabase.rpc(
      "fetch_attempt_questions",
      { p_attempt_id: attemptId },
    );
    const questions = parseQuestionsFromRpc(rpcQuestions);
    const answers = parseAnswers(row.answers);
    return {
      data: {
        attemptId: row.id,
        assignmentId: row.assignment_id,
        studentId: row.student_id,
        studentDisplayName: row.student?.display_name ?? null,
        studentEmail: row.student?.email ?? "",
        assignmentTitle: row.assignments?.title ?? "Assignment",
        startedAt: row.started_at,
        submittedAt: row.submitted_at,
        scorePercent:
          row.score_percent === null ? null : Number(row.score_percent),
        correctCount: row.correct_count,
        totalQuestions: row.total_questions,
        durationSeconds: row.duration_seconds,
        result,
        questions,
        answers,
        feedbackText: row.feedback_text ?? null,
        scoreOverride:
          row.score_override === null || row.score_override === undefined
            ? null
            : Number(row.score_override),
        gradedAt: row.graded_at ?? null,
        graderId: row.grader_id ?? null,
        effectiveScore: (() => {
          if (row.score_override !== null && row.score_override !== undefined) {
            return Number(row.score_override);
          }
          if (row.score_percent !== null && row.score_percent !== undefined) {
            return Number(row.score_percent);
          }
          return null;
        })(),
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export function formatAttemptTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
