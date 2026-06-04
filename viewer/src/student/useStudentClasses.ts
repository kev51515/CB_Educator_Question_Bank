/**
 * useStudentClasses — lists the courses the signed-in student belongs to.
 *
 * Reads from `course_memberships` joined to `courses` (and the teacher's
 * profile so we can show the teacher name). The RLS policy on
 * course_memberships limits the result to the caller's own rows, so we don't
 * need to filter by student_id manually — supabase-js will still send the
 * auth context, and the policy does the rest.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface StudentClass {
  /** Membership row id — needed when the student leaves the course. */
  membership_id: string;
  id: string;
  short_code: string;
  name: string;
  description: string | null;
  join_code: string;
  joined_at: string;
  teacher_display_name: string | null;
}

export interface UseStudentClasses {
  classes: StudentClass[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface MembershipRow {
  id: string;
  joined_at: string;
  courses: {
    id: string;
    short_code: string;
    name: string;
    description: string | null;
    join_code: string;
    teacher: { display_name: string | null } | null;
  } | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load courses.";
}

export function useStudentClasses(): UseStudentClasses {
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("course_memberships")
        .select(
          // Why: a single nested select is cheaper than fetching memberships
          // + courses + profiles in three round trips. RLS still applies to
          // each table accessed via the embedded resource.
          "id, joined_at, courses:courses(id, short_code, name, description, join_code, teacher:profiles!courses_teacher_id_fkey(display_name))",
        )
        .order("joined_at", { ascending: false });

      if (queryError) {
        setClasses([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as MembershipRow[];
      const mapped: StudentClass[] = rows
        .filter((row): row is MembershipRow & { courses: NonNullable<MembershipRow["courses"]> } =>
          row.courses !== null,
        )
        .map((row) => ({
          membership_id: row.id,
          id: row.courses.id,
          short_code: row.courses.short_code,
          name: row.courses.name,
          description: row.courses.description,
          join_code: row.courses.join_code,
          joined_at: row.joined_at,
          teacher_display_name: row.courses.teacher?.display_name ?? null,
        }));
      setClasses(mapped);
    } catch (err: unknown) {
      setClasses([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { classes, loading, error, refresh };
}
