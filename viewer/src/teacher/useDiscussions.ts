/**
 * useDiscussions — lists discussion topics for a single course, ordered
 * pinned-first then newest. Embeds the author display name via the FK so the
 * topic list can render bylines without a second round trip.
 *
 * RLS (migration 0025) constrains visibility to enrolled students + staff,
 * routed through the SECURITY DEFINER helpers public.is_student_in_course()
 * and public.is_staff() — see the migration for the recursion-safe pattern.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface DiscussionTopic {
  id: string;
  short_code: string;
  course_id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface UseDiscussions {
  topics: DiscussionTopic[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface DiscussionTopicRow {
  id: string;
  short_code: string;
  course_id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  created_at: string;
  updated_at: string;
  author: { display_name: string | null; email: string } | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load discussions.";
}

export function useDiscussions(courseId: string | null): UseDiscussions {
  const [topics, setTopics] = useState<DiscussionTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseId) {
      setTopics([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("discussion_topics")
        .select(
          "id, short_code, course_id, author_id, title, body, pinned, locked, created_at, updated_at, author:profiles!discussion_topics_author_id_fkey(display_name, email)",
        )
        .eq("course_id", courseId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (queryError) {
        setTopics([]);
        setError(queryError.message);
        return;
      }

      const rows = (data ?? []) as unknown as DiscussionTopicRow[];
      const mapped: DiscussionTopic[] = rows.map((row) => ({
        id: row.id,
        short_code: row.short_code,
        course_id: row.course_id,
        author_id: row.author_id,
        author_name:
          row.author?.display_name ?? row.author?.email ?? "Unknown",
        title: row.title,
        body: row.body,
        pinned: row.pinned,
        locked: row.locked,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      setTopics(mapped);
    } catch (err: unknown) {
      setTopics([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: refetch on any topic change scoped to this course so peer/teacher
  // posts appear without a manual reload. Channel name is course-scoped to
  // avoid cross-talk between courses open in multiple tabs.
  useEffect(() => {
    if (!courseId) return;
    const channel = supabase
      .channel(`discussion-topics:${courseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "discussion_topics",
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

  return { topics, loading, error, refresh };
}
