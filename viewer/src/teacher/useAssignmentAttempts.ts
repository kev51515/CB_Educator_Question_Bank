/**
 * useAssignmentAttempts — lists all student attempts on a single assignment.
 *
 * Joins to the student's profile for display_name + email. Ordered by
 * submitted_at DESC, then started_at DESC, so submitted rows appear first
 * and in-progress rows fall to the bottom (NULLS LAST is the default for
 * DESC in Postgres).
 *
 * RLS guarantees only the owning teacher (or admin) can read these rows.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface AssignmentAttempt {
  id: string;
  assignment_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  score_percent: number | null;
  /** Teacher-set override (migration 0053). When non-null, surfaces as the
   *  "effective score" on student-facing displays. */
  score_override: number | null;
  /** `COALESCE(score_override, score_percent)` — prefer for display. */
  effective_score: number | null;
  graded_at: string | null;
  correct_count: number | null;
  total_questions: number | null;
  duration_seconds: number | null;
  student_display_name: string | null;
  student_email: string;
}

export interface UseAssignmentAttempts {
  attempts: AssignmentAttempt[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface AttemptRow {
  id: string;
  assignment_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  score_percent: number | string | null;
  score_override: number | string | null;
  graded_at: string | null;
  correct_count: number | null;
  total_questions: number | null;
  duration_seconds: number | null;
  student: {
    display_name: string | null;
    email: string;
  } | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load attempts.";
}

export function useAssignmentAttempts(
  assignmentId: string | null,
): UseAssignmentAttempts {
  const [attempts, setAttempts] = useState<AssignmentAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!assignmentId) {
      setAttempts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("assignment_attempts")
        .select(
          // Disambiguate the FK to profiles so PostgREST joins correctly.
          // 0053: score_override + graded_at added so the gradebook + the
          // "Adjusted by teacher" pill have what they need without a 2nd
          // round-trip.
          "id, assignment_id, student_id, started_at, submitted_at, score_percent, score_override, graded_at, correct_count, total_questions, duration_seconds, student:profiles!assignment_attempts_student_id_fkey(display_name, email)",
        )
        .eq("assignment_id", assignmentId)
        .order("submitted_at", { ascending: false })
        .order("started_at", { ascending: false });

      if (queryError) {
        setAttempts([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as AttemptRow[];
      const mapped: AssignmentAttempt[] = rows.map((row) => {
        const pct =
          row.score_percent === null || row.score_percent === undefined
            ? null
            : Number(row.score_percent);
        const override =
          row.score_override === null || row.score_override === undefined
            ? null
            : Number(row.score_override);
        return {
          id: row.id,
          assignment_id: row.assignment_id,
          student_id: row.student_id,
          started_at: row.started_at,
          submitted_at: row.submitted_at,
          score_percent: pct,
          score_override: override,
          effective_score: override ?? pct,
          graded_at: row.graded_at ?? null,
          correct_count: row.correct_count,
          total_questions: row.total_questions,
          duration_seconds: row.duration_seconds,
          student_display_name: row.student?.display_name ?? null,
          student_email: row.student?.email ?? "",
        };
      });
      setAttempts(mapped);
    } catch (err: unknown) {
      setAttempts([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { attempts, loading, error, refresh };
}
