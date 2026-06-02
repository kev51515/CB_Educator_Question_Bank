/**
 * useAnnouncements — lists the announcements for a single course, plus a
 * realtime subscription so a teacher creating a post in one tab sees it
 * appear in another.
 *
 * The query joins to `profiles` for the author's display name so the card
 * UI doesn't need a second round trip. RLS already constrains visibility
 * to staff (full) / enrolled students (published rows only); we still scope
 * by `course_id` so the query plan can use the composite index.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface Announcement {
  id: string;
  course_id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  pinned: boolean;
  published: boolean;
  /**
   * Scheduled-publish timestamp. NULL = visible immediately (legacy + the
   * default). When set in the future, students do not see this row until
   * now() >= publish_at; teachers always see it and the list shows a
   * "Scheduled" badge so Maya knows which rows are queued. Added in 0054.
   */
  publish_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UseAnnouncements {
  announcements: Announcement[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface AnnouncementRow {
  id: string;
  course_id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  published: boolean;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  author: { display_name: string | null; email: string } | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load announcements.";
}

export function useAnnouncements(courseId: string | null): UseAnnouncements {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseId) {
      setAnnouncements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("course_announcements")
        .select(
          // Embed author via the FK so we can render the byline without a
          // separate fetch. RLS on profiles allows staff (full read) and
          // teachers (their enrolled students); the author is always staff,
          // so embedding works for the staff caller. For students, the
          // existing "teacher sees enrolled students" + "staff reads all"
          // profile policies don't help — but students only need the name,
          // so we fall back to "Teacher" in the UI if the embed is null.
          "id, course_id, author_id, title, body, pinned, published, publish_at, created_at, updated_at, author:profiles!course_announcements_author_id_fkey(display_name, email)",
        )
        .eq("course_id", courseId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (queryError) {
        setAnnouncements([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as AnnouncementRow[];
      const mapped: Announcement[] = rows.map((row) => ({
        id: row.id,
        course_id: row.course_id,
        author_id: row.author_id,
        author_name:
          row.author?.display_name ?? row.author?.email ?? "Teacher",
        title: row.title,
        body: row.body,
        pinned: row.pinned,
        published: row.published,
        publish_at: row.publish_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      setAnnouncements(mapped);
    } catch (err: unknown) {
      setAnnouncements([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: refetch on any insert / update / delete scoped to this course.
  // The channel name is course-scoped so multiple courses open in different
  // tabs don't cross-trigger each other.
  useEffect(() => {
    if (!courseId) return;
    const channel = supabase
      .channel(`course-announcements:${courseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "course_announcements",
          filter: `course_id=eq.${courseId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [courseId, refresh]);

  return { announcements, loading, error, refresh };
}
