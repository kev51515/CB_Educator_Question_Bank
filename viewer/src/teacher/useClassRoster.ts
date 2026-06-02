/**
 * useClassRoster — lists the students enrolled in a given course.
 *
 * Used by the ClassRoster / ClassOverview tabs. Joins class_memberships →
 * profiles so the table has display_name + email + joined_at. RLS
 * guarantees only the owning teacher (or admin) can see these rows.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface RosterStudent {
  membership_id: string;
  student_id: string;
  display_name: string | null;
  email: string;
  joined_at: string;
}

export interface UseClassRoster {
  roster: RosterStudent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface RosterRow {
  id: string;
  joined_at: string;
  student_id: string;
  student: {
    display_name: string | null;
    email: string;
  } | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load roster.";
}

export function useClassRoster(classId: string | null): UseClassRoster {
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!classId) {
      setRoster([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("course_memberships")
        .select(
          // Disambiguate the FK explicitly so PostgREST picks the right join.
          "id, joined_at, student_id, student:profiles!course_memberships_student_id_fkey(display_name, email)",
        )
        .eq("course_id", classId)
        .order("joined_at", { ascending: true });

      if (queryError) {
        setRoster([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as RosterRow[];
      const mapped: RosterStudent[] = rows.map((row) => ({
        membership_id: row.id,
        student_id: row.student_id,
        display_name: row.student?.display_name ?? null,
        email: row.student?.email ?? "",
        joined_at: row.joined_at,
      }));
      setRoster(mapped);
    } catch (err: unknown) {
      setRoster([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { roster, loading, error, refresh };
}
