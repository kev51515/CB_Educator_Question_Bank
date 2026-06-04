/**
 * useStudentAnnouncements — the 10 most recent announcements across every
 * course the signed-in student is enrolled in. Used for the AreaSelector
 * "Recent announcements" widget.
 *
 * RLS handles scoping: the SELECT policy on course_announcements is
 *   published = true AND is_student_in_class(auth.uid(), course_id)
 * so we don't need to filter by membership manually. We embed the parent
 * course for its name (RLS lets enrolled students read their courses)
 * and order by pinned-first then date.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface StudentAnnouncement {
  id: string;
  course_id: string;
  course_name: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
}

export interface UseStudentAnnouncements {
  announcements: StudentAnnouncement[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface AnnouncementRow {
  id: string;
  course_id: string;
  title: string;
  body: string;
  pinned: boolean;
  publish_at: string | null;
  created_at: string;
  courses: { name: string } | null;
}

const RECENT_LIMIT = 10;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load announcements.";
}

export function useStudentAnnouncements(): UseStudentAnnouncements {
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Hide scheduled rows whose publish_at is still in the future.
      // PostgREST OR syntax: comma-separated terms, each in `field.op.value`
      // form. `is.null` matches NULL (legacy + immediate-publish rows);
      // `lte.<iso>` matches rows whose scheduled moment has arrived.
      // RLS still gates by enrollment / published=true; this is a layered
      // SELECT filter so teachers' draft scheduled posts never leak.
      const nowIso = new Date().toISOString();
      const { data, error: queryError } = await supabase
        .from("course_announcements")
        .select(
          // Embed the parent course for its name. Pinned-first, newest-next,
          // capped at RECENT_LIMIT so the dashboard widget stays cheap.
          "id, course_id, title, body, pinned, publish_at, created_at, courses:courses!course_announcements_course_id_fkey(name)",
        )
        .or(`publish_at.is.null,publish_at.lte.${nowIso}`)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);

      if (queryError) {
        setAnnouncements([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as AnnouncementRow[];
      const mapped: StudentAnnouncement[] = rows.map((row) => ({
        id: row.id,
        course_id: row.course_id,
        course_name: row.courses?.name ?? "",
        title: row.title,
        body: row.body,
        pinned: row.pinned,
        created_at: row.created_at,
      }));
      setAnnouncements(mapped);
    } catch (err: unknown) {
      setAnnouncements([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { announcements, loading, error, refresh };
}
