/**
 * useClassRoster — lists the students enrolled in a given course.
 *
 * Used by the ClassRoster / ClassOverview tabs. Joins course_memberships →
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
  /** Per-course recognition code (e.g. "KQAZNP-04"), null for legacy rows. */
  roster_code: string | null;
  /** Login username for teacher-created accounts; null for self-signups. */
  login_code: string | null;
  /** True when this account was created by a teacher (resettable password). */
  managed: boolean;
  /** When the student first claimed/activated their managed login; null = never used. */
  claimed_at: string | null;
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
  roster_code: string | null;
  student: {
    display_name: string | null;
    email: string;
    login_code: string | null;
    managed: boolean | null;
    claimed_at: string | null;
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
          "id, joined_at, student_id, roster_code, student:profiles!course_memberships_student_id_fkey(display_name, email, login_code, managed, claimed_at)",
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
        roster_code: row.roster_code ?? null,
        login_code: row.student?.login_code ?? null,
        managed: row.student?.managed === true,
        claimed_at: row.student?.claimed_at ?? null,
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
