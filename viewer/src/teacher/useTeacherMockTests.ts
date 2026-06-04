/**
 * useTeacherMockTests — lists every `kind='mocktest'` assignment the
 * signed-in teacher owns, across all of their courses.
 *
 * Powers the Practice Tests catalog on `/question-bank`. Unlike
 * `useAssignments` (which is scoped to a single course), Practice Tests
 * is a *global* surface — the teacher wants to scan their entire pool of
 * practice tests at once and filter by course / source / archived.
 *
 * Returns archived rows as well so the catalog can filter on them; the
 * default UI filter is "Active" but the row data carries everything.
 *
 * No realtime subscription yet — the page calls `refresh()` after every
 * mutation (archive toggle, delete, create). Adding postgres_changes
 * later is cheap if a multi-tab UX justifies it.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  AssignmentDifficultyMix,
  AssignmentSourceId,
} from "./useAssignments";

export interface TeacherMockTestCourse {
  id: string;
  short_code: string;
  name: string;
  archived: boolean;
}

export interface TeacherMockTest {
  id: string;
  short_code: string;
  title: string;
  description: string | null;
  source_id: AssignmentSourceId;
  question_count: number;
  time_limit_minutes: number;
  difficulty_mix: AssignmentDifficultyMix;
  due_at: string | null;
  archived: boolean;
  created_at: string;
  course: TeacherMockTestCourse;
}

export interface UseTeacherMockTests {
  mockTests: TeacherMockTest[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface MockTestRow {
  id: string;
  short_code: string;
  title: string;
  description: string | null;
  source_id: string;
  question_count: number;
  time_limit_minutes: number;
  difficulty_mix: string;
  due_at: string | null;
  archived: boolean;
  created_at: string;
  course:
    | {
        id: string;
        short_code: string;
        name: string;
        archived: boolean;
      }
    | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load practice tests.";
}

function isSourceId(value: string): value is AssignmentSourceId {
  return value === "cb" || value === "sat" || value === "mixed";
}

function isDifficultyMix(value: string): value is AssignmentDifficultyMix {
  return (
    value === "easy" || value === "medium" || value === "hard" || value === "any"
  );
}

export function useTeacherMockTests(
  teacherId: string | null,
): UseTeacherMockTests {
  const [mockTests, setMockTests] = useState<TeacherMockTest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!teacherId) {
      setMockTests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Embed the owning course so the catalog can render the course chip
      // and build short_code URLs without a second round-trip.
      const { data, error: queryError } = await supabase
        .from("assignments")
        .select(
          "id, short_code, title, description, source_id, question_count, time_limit_minutes, difficulty_mix, due_at, archived, created_at, course:courses!course_id(id, short_code, name, archived)",
        )
        .eq("kind", "mocktest")
        .eq("created_by", teacherId)
        .order("created_at", { ascending: false });

      if (queryError) {
        setMockTests([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as MockTestRow[];
      const mapped: TeacherMockTest[] = rows
        // Defensive: a row with no embedded course shouldn't render — it's
        // either an orphan or an RLS issue, and the catalog needs the
        // course chip + URL to function.
        .filter((row): row is MockTestRow & { course: NonNullable<MockTestRow["course"]> } =>
          row.course !== null,
        )
        .map((row) => ({
          id: row.id,
          short_code: row.short_code,
          title: row.title,
          description: row.description,
          source_id: isSourceId(row.source_id) ? row.source_id : "cb",
          question_count: row.question_count,
          time_limit_minutes: row.time_limit_minutes,
          difficulty_mix: isDifficultyMix(row.difficulty_mix)
            ? row.difficulty_mix
            : "any",
          due_at: row.due_at,
          archived: row.archived,
          created_at: row.created_at,
          course: {
            id: row.course.id,
            short_code: row.course.short_code,
            name: row.course.name,
            archived: row.course.archived,
          },
        }));
      setMockTests(mapped);
    } catch (err: unknown) {
      setMockTests([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { mockTests, loading, error, refresh };
}
