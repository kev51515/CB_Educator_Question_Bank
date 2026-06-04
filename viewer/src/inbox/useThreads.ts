/**
 * useThreads
 * ==========
 * Lists all 1:1 message threads the current user is a participant of.
 *
 * Each thread row is augmented with:
 *   - the *other* participant's profile (display name + email) for rendering
 *   - the most recent message body (snippet)
 *   - an unread count: messages authored by the OTHER user whose
 *     `read_by_recipient_at` is still NULL.
 *
 * Sort order: `last_message_at desc nulls last`. Newly opened (empty) threads
 * still show at the bottom rather than disappearing.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface InboxOtherParticipant {
  id: string;
  display_name: string | null;
  email: string;
}

export interface InboxThreadSummary {
  id: string;
  other: InboxOtherParticipant;
  last_message_at: string | null;
  last_message_snippet: string | null;
  unread_count: number;
}

interface UseThreadsResult {
  threads: InboxThreadSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load threads.";
}

interface ThreadRow {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message_at: string | null;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  email: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  read_by_recipient_at: string | null;
  created_at: string;
}

export function useThreads(currentUserId: string | null): UseThreadsResult {
  const [threads, setThreads] = useState<InboxThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentUserId) {
      setThreads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: threadRowsRaw, error: tErr } = await supabase
        .from("message_threads")
        .select("id, participant_a, participant_b, last_message_at")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (tErr) throw tErr;
      const threadRows: ThreadRow[] = (threadRowsRaw ?? []) as ThreadRow[];
      if (threadRows.length === 0) {
        setThreads([]);
        setLoading(false);
        return;
      }

      const otherIds = Array.from(
        new Set(
          threadRows.map((t) =>
            t.participant_a === currentUserId ? t.participant_b : t.participant_a,
          ),
        ),
      );
      const threadIds = threadRows.map((t) => t.id);

      const [profilesRes, messagesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", otherIds),
        supabase
          .from("messages")
          .select("id, thread_id, author_id, body, read_by_recipient_at, created_at")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: false }),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (messagesRes.error) throw messagesRes.error;

      const profilesById = new Map<string, ProfileRow>();
      for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
        profilesById.set(p.id, p);
      }

      const messagesByThread = new Map<string, MessageRow[]>();
      for (const m of (messagesRes.data ?? []) as MessageRow[]) {
        const list = messagesByThread.get(m.thread_id) ?? [];
        list.push(m);
        messagesByThread.set(m.thread_id, list);
      }

      const summaries: InboxThreadSummary[] = threadRows.map((t) => {
        const otherId =
          t.participant_a === currentUserId ? t.participant_b : t.participant_a;
        const otherProfile = profilesById.get(otherId);
        const msgs = messagesByThread.get(t.id) ?? [];
        const latest = msgs[0];
        const unread = msgs.filter(
          (m) => m.author_id !== currentUserId && m.read_by_recipient_at === null,
        ).length;
        return {
          id: t.id,
          other: {
            id: otherId,
            display_name: otherProfile?.display_name ?? null,
            email: otherProfile?.email ?? "",
          },
          last_message_at: t.last_message_at,
          last_message_snippet: latest ? latest.body : null,
          unread_count: unread,
        };
      });
      setThreads(summaries);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: refetch whenever a new message lands or a thread row is
  // touched (last_message_at bump on insert). Scoped to the current user
  // via a single channel; RLS already restricts visibility to threads
  // they participate in, so we listen on the whole table.
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`inbox-threads:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          void load();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "message_threads" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, load]);

  return { threads, loading, error, refresh: load };
}
