/**
 * useTopicPosts — fetches all posts for a single discussion topic, plus the
 * topic row itself so the view can render the original message + thread.
 *
 * Realtime: subscribes to posts under this topic so peer replies appear
 * without manual refresh. RLS on discussion_posts requires the caller be
 * enrolled in / staff for the topic's course (see migration 0025).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { DiscussionTopic } from "./useDiscussions";

export interface DiscussionPost {
  id: string;
  topic_id: string;
  author_id: string;
  author_name: string;
  body: string;
  parent_post_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UseTopicPosts {
  topic: DiscussionTopic | null;
  posts: DiscussionPost[];
  loading: boolean;
  error: string | null;
  notFound: boolean;
  refresh: () => Promise<void>;
}

interface TopicRow {
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

interface PostRow {
  id: string;
  topic_id: string;
  author_id: string;
  body: string;
  parent_post_id: string | null;
  created_at: string;
  updated_at: string;
  author: { display_name: string | null; email: string } | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load discussion.";
}

function nameFrom(author: { display_name: string | null; email: string } | null): string {
  return author?.display_name ?? author?.email ?? "Unknown";
}

export function useTopicPosts(topicId: string | null): UseTopicPosts {
  const [topic, setTopic] = useState<DiscussionTopic | null>(null);
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!topicId) {
      setTopic(null);
      setPosts([]);
      setLoading(false);
      setNotFound(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      // Detect URL slug format: 6-char A-Z0-9 short_code vs UUID. Lets
      // /courses/AB12CD/discussions/H7K9MN resolve via the new slug column
      // while keeping legacy UUID links functional.
      const isShortCode = /^[A-Z0-9]{6}$/.test(topicId);
      const topicReq = supabase
        .from("discussion_topics")
        .select(
          "id, short_code, course_id, author_id, title, body, pinned, locked, created_at, updated_at, author:profiles!discussion_topics_author_id_fkey(display_name, email)",
        )
        .eq(isShortCode ? "short_code" : "id", topicId)
        .maybeSingle();

      const topicRes = await topicReq;
      if (topicRes.error) {
        setError(topicRes.error.message);
        setTopic(null);
        setPosts([]);
        return;
      }
      const topicRow = topicRes.data as unknown as TopicRow | null;
      if (!topicRow) {
        setNotFound(true);
        setTopic(null);
        setPosts([]);
        return;
      }

      const postsRes = await supabase
        .from("discussion_posts")
        .select(
          "id, topic_id, author_id, body, parent_post_id, created_at, updated_at, author:profiles!discussion_posts_author_id_fkey(display_name, email)",
        )
        .eq("topic_id", topicRow.id)
        .order("created_at", { ascending: true });

      setTopic({
        id: topicRow.id,
        short_code: topicRow.short_code,
        course_id: topicRow.course_id,
        author_id: topicRow.author_id,
        author_name: nameFrom(topicRow.author),
        title: topicRow.title,
        body: topicRow.body,
        pinned: topicRow.pinned,
        locked: topicRow.locked,
        created_at: topicRow.created_at,
        updated_at: topicRow.updated_at,
      });

      if (postsRes.error) {
        setError(postsRes.error.message);
        setPosts([]);
        return;
      }
      const postRows = (postsRes.data ?? []) as unknown as PostRow[];
      setPosts(
        postRows.map((row) => ({
          id: row.id,
          topic_id: row.topic_id,
          author_id: row.author_id,
          author_name: nameFrom(row.author),
          body: row.body,
          parent_post_id: row.parent_post_id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })),
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setTopic(null);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: new posts/edits in this topic stream in without a manual
  // refresh. Channel is topic-scoped (by the resolved UUID, not the URL slug
  // since the slug may be a short_code which postgres_changes filter can't
  // resolve) to avoid cross-topic chatter.
  const topicUuid = topic?.id ?? null;
  useEffect(() => {
    if (!topicUuid) return;
    const channel = supabase
      .channel(`discussion-posts:${topicUuid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "discussion_posts",
          filter: `topic_id=eq.${topicUuid}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [topicUuid, refresh]);

  return { topic, posts, loading, error, notFound, refresh };
}
