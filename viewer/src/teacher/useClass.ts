/**
 * useClass — fetch a single course row by id.
 *
 * Separate from useTeacherClasses because the new routed surface
 * (ClassLayout) is mounted at /classes/:classId and needs to be able to
 * load a course directly from the URL — without the teacher console having
 * pre-fetched the list first (e.g. a deep link, a refresh, a bookmark).
 *
 * Returns `notFound = true` when the row simply doesn't exist (or RLS
 * denies access). The layout uses that to redirect back to /classes.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TeacherClass } from "./useTeacherClasses";

export interface UseClass {
  cls: TeacherClass | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  refresh: () => Promise<void>;
  /**
   * Apply a local patch to the cached course so callers that just mutated
   * the row (rename, archive toggle, regenerate code) can reflect the
   * change without waiting for a refetch.
   */
  patch: (patch: Partial<TeacherClass>) => void;
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

/**
 * URL course refs may be either a UUID (legacy bookmarks) or a 6-char
 * short_code (new). UUIDs are 36 chars with dashes; short_codes are exactly
 * 6 caps/digits. Anything else falls back to UUID lookup which will
 * notFound, which is the safe outcome.
 */
function isShortCode(ref: string): boolean {
  return /^[A-Z0-9]{6}$/.test(ref);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load course.";
}

export function useClass(classId: string | null | undefined): UseClass {
  const [cls, setCls] = useState<TeacherClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!classId) {
      setCls(null);
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const lookupColumn = isShortCode(classId) ? "short_code" : "id";
      const { data, error: queryError } = await supabase
        .from("courses")
        .select(
          "id, short_code, name, description, join_code, archived, is_template, created_at, updated_at, course_memberships(count)",
        )
        .eq(lookupColumn, classId)
        .maybeSingle();

      if (queryError) {
        setCls(null);
        setError(queryError.message);
        return;
      }

      if (!data) {
        setCls(null);
        setNotFound(true);
        return;
      }

      const row = data as unknown as ClassRow;
      setCls({
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
      });
    } catch (err: unknown) {
      setCls(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = useCallback((p: Partial<TeacherClass>): void => {
    setCls((prev) => (prev ? { ...prev, ...p } : prev));
  }, []);

  return { cls, loading, error, notFound, refresh, patch };
}
