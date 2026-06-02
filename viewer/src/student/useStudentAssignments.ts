/**
 * useStudentAssignments — lists all assignments visible to the signed-in
 * student across every course they've joined, joined with the student's own
 * attempt row (if any).
 *
 * We do a single PostgREST call: select the assignment, embed the parent
 * course for its name, and embed the caller's own attempts via the FK. RLS
 * already restricts assignments to courses the student belongs to (and
 * assignment_attempts to the student's own rows), so the call is
 * implicitly filtered without an extra where clause.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  AssignmentDifficultyMix,
  AssignmentSourceId,
} from "../teacher/useAssignments";

export interface StudentAssignmentAttempt {
  id: string;
  started_at: string;
  submitted_at: string | null;
  score_percent: number | null;
  correct_count: number | null;
  total_questions: number | null;
  /** Teacher manual override (0-100); when present, supersedes score_percent. */
  score_override?: number | null;
  /** Set when the teacher marks the attempt as graded. */
  graded_at?: string | null;
  /** Teacher-authored feedback (markdown/HTML); empty string treated as null. */
  feedback_text?: string | null;
}

export interface StudentAssignment {
  id: string;
  course_id: string;
  class_name: string;
  title: string;
  description: string | null;
  source_id: AssignmentSourceId;
  question_count: number;
  time_limit_minutes: number;
  difficulty_mix: AssignmentDifficultyMix;
  due_at: string | null;
  opens_at: string;
  created_at: string;
  /** Null until the student starts the assignment. */
  my_attempt: StudentAssignmentAttempt | null;
}

export interface UseStudentAssignments {
  assignments: StudentAssignment[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface AssignmentRow {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  source_id: string;
  question_count: number;
  time_limit_minutes: number;
  difficulty_mix: string;
  due_at: string | null;
  opens_at: string;
  created_at: string;
  archived: boolean;
  courses: { name: string } | null;
  assignment_attempts: {
    id: string;
    started_at: string;
    submitted_at: string | null;
    score_percent: number | null;
    correct_count: number | null;
    total_questions: number | null;
    score_override: number | null;
    graded_at: string | null;
    feedback_text: string | null;
  }[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load assignments.";
}

function isSourceId(value: string): value is AssignmentSourceId {
  return value === "cb" || value === "sat" || value === "mixed";
}

function isDifficultyMix(value: string): value is AssignmentDifficultyMix {
  return (
    value === "easy" || value === "medium" || value === "hard" || value === "any"
  );
}

export function useStudentAssignments(): UseStudentAssignments {
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("assignments")
        .select(
          // Embedded course for name + embedded attempts (RLS scopes attempts
          // to student_id = auth.uid(), so we get at most one row).
          "id, short_code, course_id, title, description, source_id, question_count, time_limit_minutes, difficulty_mix, due_at, opens_at, created_at, archived, courses:courses!assignments_course_id_fkey(name, short_code), assignment_attempts(id, started_at, submitted_at, score_percent, correct_count, total_questions, score_override, graded_at, feedback_text)",
        )
        .eq("archived", false)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (queryError) {
        setAssignments([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as AssignmentRow[];
      const mapped: StudentAssignment[] = rows.map((row) => {
        // Prefer the most-recent submitted attempt so grading state on the
        // latest finished attempt is what drives the row indicator. If none
        // are submitted, fall back to the first (typically in-progress) row.
        const attempts = row.assignment_attempts ?? [];
        const submitted = attempts
          .filter((a) => a.submitted_at !== null)
          .sort((a, b) => {
            const aT = a.submitted_at ? Date.parse(a.submitted_at) : 0;
            const bT = b.submitted_at ? Date.parse(b.submitted_at) : 0;
            return bT - aT;
          });
        const attempt = submitted[0] ?? attempts[0] ?? null;
        return {
          id: row.id,
          course_id: row.course_id,
          class_name: row.courses?.name ?? "",
          title: row.title,
          description: row.description,
          source_id: isSourceId(row.source_id) ? row.source_id : "cb",
          question_count: row.question_count,
          time_limit_minutes: row.time_limit_minutes,
          difficulty_mix: isDifficultyMix(row.difficulty_mix)
            ? row.difficulty_mix
            : "any",
          due_at: row.due_at,
          opens_at: row.opens_at,
          created_at: row.created_at,
          my_attempt: attempt
            ? {
                id: attempt.id,
                started_at: attempt.started_at,
                submitted_at: attempt.submitted_at,
                score_percent:
                  attempt.score_percent === null
                    ? null
                    : Number(attempt.score_percent),
                correct_count: attempt.correct_count,
                total_questions: attempt.total_questions,
                score_override:
                  attempt.score_override === null
                    ? null
                    : Number(attempt.score_override),
                graded_at: attempt.graded_at,
                feedback_text:
                  attempt.feedback_text && attempt.feedback_text.trim().length > 0
                    ? attempt.feedback_text
                    : null,
              }
            : null,
        };
      });
      setAssignments(mapped);
    } catch (err: unknown) {
      setAssignments([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { assignments, loading, error, refresh };
}
