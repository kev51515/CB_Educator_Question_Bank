/**
 * useAssignments — lists the assignments a teacher has published to a course.
 *
 * Returns archived rows as well so the teacher can see / manage them
 * (rendered with a muted style + archived badge). RLS already restricts
 * visibility to the owning teacher (or admin); we still constrain by
 * course_id so the query plan is index-only.
 *
 * No realtime subscription yet — the teacher console refreshes after create
 * via the `refresh` callback. We can add postgres_changes later if a multi-
 * device "same teacher, two tabs" UX justifies it.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { recentGradingCutoffIso } from "./assignmentsFilter";

export type AssignmentSourceId = "cb" | "sat" | "mixed";
export type AssignmentDifficultyMix = "easy" | "medium" | "hard" | "any";

export interface Assignment {
  id: string;
  /** 6-char A-Z2-9 stable URL slug (migration 0039). Prefer this for URLs. */
  short_code: string;
  course_id: string;
  created_by: string;
  title: string;
  description: string | null;
  source_id: AssignmentSourceId;
  question_count: number;
  time_limit_minutes: number;
  difficulty_mix: AssignmentDifficultyMix;
  due_at: string | null;
  opens_at: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  /**
   * Number of attempts on this assignment that a teacher touched in the
   * last 7 days (`graded_at >= cutoff` OR `feedback_text` non-null +
   * updated_at >= cutoff). Powers the AssignmentsToolbar "Recently graded"
   * filter pill. Optional so adapter call-sites that synthesise an
   * `Assignment` from other shapes (`QuestionBankPage`,
   * `AssignmentDetailPage`) can default to 0 without ceremony.
   */
  recently_graded_count?: number;
}

export interface UseAssignments {
  assignments: Assignment[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface AssignmentRow {
  id: string;
  short_code: string;
  course_id: string;
  created_by: string;
  title: string;
  description: string | null;
  source_id: string;
  question_count: number;
  time_limit_minutes: number;
  difficulty_mix: string;
  due_at: string | null;
  opens_at: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
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

export function useAssignments(classId: string | null): UseAssignments {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!classId) {
      setAssignments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("assignments")
        .select(
          "id, short_code, course_id, created_by, title, description, source_id, question_count, time_limit_minutes, difficulty_mix, due_at, opens_at, archived, created_at, updated_at",
        )
        .eq("course_id", classId)
        .eq("hidden", false)
        .order("created_at", { ascending: false });

      if (queryError) {
        setAssignments([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as AssignmentRow[];
      const assignmentIds = rows.map((r) => r.id);

      // Secondary query: tally recently-graded attempts per assignment for
      // the "Recently graded" filter pill. Best-effort — failures here
      // degrade silently to count=0 so the primary list still renders.
      const recentMap = new Map<string, number>();
      if (assignmentIds.length > 0) {
        try {
          const cutoff = recentGradingCutoffIso();
          // Either graded_at is recent, OR (feedback_text exists AND row was
          // touched recently). The `.or()` syntax accepts nested filters; if
          // a column doesn't exist (pre-0056), the query fails and we
          // gracefully skip the tally.
          const recentRes = await supabase
            .from("assignment_attempts")
            .select("assignment_id, graded_at, feedback_text, updated_at")
            .in("assignment_id", assignmentIds)
            .or(`graded_at.gte.${cutoff},updated_at.gte.${cutoff}`);
          if (!recentRes.error) {
            for (const r of (recentRes.data ?? []) as Array<{
              assignment_id: string;
              graded_at: string | null;
              feedback_text: string | null;
              updated_at: string | null;
            }>) {
              const hasFeedback =
                r.feedback_text !== null && r.feedback_text.length > 0;
              const recentlyGraded =
                r.graded_at !== null && r.graded_at >= cutoff;
              const recentlyTouchedWithFeedback =
                hasFeedback &&
                r.updated_at !== null &&
                r.updated_at >= cutoff;
              if (recentlyGraded || recentlyTouchedWithFeedback) {
                recentMap.set(
                  r.assignment_id,
                  (recentMap.get(r.assignment_id) ?? 0) + 1,
                );
              }
            }
          }
        } catch {
          // best-effort — silent fallback
        }
      }

      const mapped: Assignment[] = rows.map((row) => ({
        id: row.id,
        short_code: row.short_code,
        course_id: row.course_id,
        created_by: row.created_by,
        title: row.title,
        description: row.description,
        // CHECK constraints in the DB make these narrowings safe at runtime,
        // but we re-validate here so a future migration that loosens the
        // constraint can't silently inject untyped values into the UI.
        source_id: isSourceId(row.source_id) ? row.source_id : "cb",
        question_count: row.question_count,
        time_limit_minutes: row.time_limit_minutes,
        difficulty_mix: isDifficultyMix(row.difficulty_mix)
          ? row.difficulty_mix
          : "any",
        due_at: row.due_at,
        opens_at: row.opens_at,
        archived: row.archived,
        created_at: row.created_at,
        updated_at: row.updated_at,
        recently_graded_count: recentMap.get(row.id) ?? 0,
      }));
      setAssignments(mapped);
    } catch (err: unknown) {
      setAssignments([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { assignments, loading, error, refresh };
}
