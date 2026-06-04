/**
 * useThreadMessages
 * =================
 * Loads all messages for a single thread, ordered by `created_at` ascending
 * (oldest → newest, conversation reading order). Exposes a `refresh()` so the
 * compose box can re-pull after an insert without a websocket subscription.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface InboxMessage {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  read_by_recipient_at: string | null;
  created_at: string;
}

interface UseThreadMessagesResult {
  messages: InboxMessage[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load messages.";
}

export function useThreadMessages(threadId: string | null): UseThreadMessagesResult {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("messages")
        .select("id, thread_id, author_id, body, read_by_recipient_at, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (err) throw err;
      setMessages((data ?? []) as InboxMessage[]);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: refetch on any change to messages in this thread so the open
  // conversation streams new messages without a manual refresh.
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`thread-messages:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, load]);

  return { messages, loading, error, refresh: load };
}
