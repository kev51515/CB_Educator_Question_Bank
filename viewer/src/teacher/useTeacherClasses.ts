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
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Monotonic counter giving every `useTeacherClasses` instance a unique realtime
 * channel topic. Two consumers mounted at once with the same teacherId (e.g. the
 * Question Bank page + its "Add to course" modal) would otherwise both call
 * `supabase.channel('teacher-classes:<id>')` — supabase-js then hands back the
 * already-subscribed channel, and the second `.on(...)` after `.subscribe()`
 * throws "cannot add postgres_changes callbacks ... after subscribe()", crashing
 * the surface. A per-instance suffix keeps topics distinct.
 */
let channelInstanceSeq = 0;

/**
 * A normal teaching Class, a college/career Counseling course (0133), or one of
 * the two Pickleball coaching course types (0150). course_type drives which
 * tabs/features each course surfaces.
 */
export type CourseType =
  | "class"
  | "counseling"
  | "pickleball_player"
  | "pickleball_coach";

/** Set of recognised course_type values for normalizing raw DB strings. */
const COURSE_TYPES: readonly CourseType[] = [
  "class",
  "counseling",
  "pickleball_player",
  "pickleball_coach",
];

/**
 * Coerce a raw `course_type` string from the DB into the typed union. Unknown
 * values fall back to "class" (the historical default). Keeps all four valid
 * values intact — do NOT collapse pickleball/counseling to class.
 */
export function normalizeCourseType(raw: string | null | undefined): CourseType {
  return (COURSE_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as CourseType)
    : "class";
}

/** User-facing label for a course_type (Vocabulary canon). */
export function courseTypeLabel(type: CourseType): string {
  switch (type) {
    case "counseling":
      return "Counseling";
    case "pickleball_player":
      return "Pickleball: Players";
    case "pickleball_coach":
      return "Pickleball: Coaches";
    case "class":
    default:
      return "Class";
  }
}

/** True for either pickleball course type. */
export function isPickleball(type: CourseType): boolean {
  return type === "pickleball_player" || type === "pickleball_coach";
}

export interface TeacherClass {
  id: string;
  /** 6-char A-Z2-9 stable URL slug (migration 0038). Prefer this over `id` for URLs. */
  short_code: string;
  name: string;
  description: string | null;
  join_code: string;
  archived: boolean;
  is_template: boolean;
  /** 'class' (default SAT-prep) or 'counseling' (unlocks counseling surfaces). */
  course_type: CourseType;
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
  course_type: string | null;
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

  // Stable, unique suffix for this hook instance's realtime channel topic so
  // two simultaneous consumers never collide (see channelInstanceSeq note).
  const instanceIdRef = useRef<number | null>(null);
  if (instanceIdRef.current === null) instanceIdRef.current = ++channelInstanceSeq;

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
          "id, short_code, name, description, join_code, archived, is_template, course_type, created_at, updated_at, course_memberships(count)",
        )
        // No teacher_id filter: RLS (migration 0130) already scopes a teacher
        // to the courses they OWN or that were SHARED with them, so this returns
        // own + shared. (An admin sees all — consistent with their oversight
        // role and the /courses list.)
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
        course_type: normalizeCourseType(row.course_type),
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
      .channel(`teacher-classes:${teacherId}:${instanceIdRef.current}`)
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
