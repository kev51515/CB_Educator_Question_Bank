/**
 * useTeacherClasses — hook that lists the signed-in teacher's courses and
 * keeps them in sync via Supabase realtime.
 *
 * Why realtime: a teacher creating a course in one tab should see it in
 * another tab without a hard refresh. We subscribe to `postgres_changes`
 * on `public.courses` filtered to this teacher_id and refetch on any
 * change (INSERT / UPDATE / DELETE). Cheap and sufficient — we're not
 * trying to do delta merges, just stay current.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface TeacherClass {
  id: string;
  /** 6-char A-Z2-9 stable URL slug (migration 0038). Prefer this over `id` for URLs. */
  short_code: string;
  name: string;
  description: string | null;
  join_code: string;
  archived: boolean;
  is_template: boolean;
  created_at: string;
  updated_at: string;
  member_count: number;
}

export interface UseTeacherClasses {
  classes: TeacherClass[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface ClassRow {
  id: string;
  short_code: string;
  name: string;
  description: string | null;
  join_code: string;
  archived: boolean;
  is_template: boolean | null;
  created_at: string;
  updated_at: string;
  course_memberships: { count: number }[] | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load courses.";
}

export function useTeacherClasses(teacherId: string | null): UseTeacherClasses {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!teacherId) {
      setClasses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("courses")
        .select(
          // Embedded count of course_memberships — PostgREST supports this
          // via the `count` modifier on a related resource.
          "id, short_code, name, description, join_code, archived, is_template, created_at, updated_at, course_memberships(count)",
        )
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });

      if (queryError) {
        setClasses([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as ClassRow[];
      const mapped: TeacherClass[] = rows.map((row) => ({
        id: row.id,
        short_code: row.short_code,
        name: row.name,
        description: row.description,
        join_code: row.join_code,
        archived: row.archived,
        is_template: row.is_template ?? false,
        created_at: row.created_at,
        updated_at: row.updated_at,
        member_count: row.course_memberships?.[0]?.count ?? 0,
      }));
      setClasses(mapped);
    } catch (err: unknown) {
      setClasses([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime subscription. The filter scopes events to this teacher's
  // courses only, so other teachers' activity won't trigger refetches.
  useEffect(() => {
    if (!teacherId) return;
    const channel = supabase
      .channel(`teacher-classes:${teacherId}`)
      .on(
        // The channel-payload generics in supabase-js are awkward to type
        // explicitly here without dragging in deep imports. The handler
        // body doesn't use the payload, so we let it be inferred.
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "courses",
          filter: `teacher_id=eq.${teacherId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teacherId, refresh]);

  return { classes, loading, error, refresh };
}
