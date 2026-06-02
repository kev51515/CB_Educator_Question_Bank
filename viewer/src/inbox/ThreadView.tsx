/**
 * ThreadView
 * ==========
 * Reads + composes within a single thread. Messages load in time order
 * (oldest → newest). On mount (and on every message reload that brings in
 * new unread messages by the other user), we mark those rows read by
 * UPDATEing `read_by_recipient_at`. The RLS policy allows the update only
 * when the actor is NOT the author — so this is safe to run for any thread
 * the current user can see.
 *
 * Compose box: textarea + Send. Enter sends; Shift+Enter inserts a newline.
 * After a successful INSERT we refetch messages and ping the parent so the
 * thread-list snippet/timestamp updates.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useProfile } from "../lib/profile";
import { supabase } from "../lib/supabase";
import { useThreadMessages, type InboxMessage } from "./useThreadMessages";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { SafeHtml } from "../components/SafeHtml";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";

interface ThreadOutletContext {
  onMessageSent?: () => void | Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to send message.";
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface OptimisticMessage extends InboxMessage {
  _pending?: boolean;
}

export function ThreadView() {
  const { threadId } = useParams<{ threadId: string }>();
  const ctx = useOutletContext<ThreadOutletContext | undefined>();
  const { profile } = useProfile();
  const currentUserId = profile?.id ?? null;
  const { messages, loading, error, refresh } = useThreadMessages(threadId ?? null);
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const markedThreadRef = useRef<string | null>(null);

  // Merge server messages with any locally-pending optimistic sends.
  // Once the server returns a real row for an optimistic one, drop the temp.
  const displayMessages = useMemo<OptimisticMessage[]>(() => {
    if (optimistic.length === 0) return messages;
    return [...messages, ...optimistic];
  }, [messages, optimistic]);

  // Mark-as-read-on-view: fire once per thread open. Marks every message in
  // this thread where the recipient is the current user and read_by_recipient_at
  // is NULL. RLS only permits the update when the actor is NOT the author.
  //
  // Best-effort silent update: if RLS rejects the write or the network fails,
  // we log to console but do NOT toast — the unread badge simply remains and
  // the next thread open (or page reload) will retry. Toasting here would be
  // noisy for a background reconciliation the user didn't initiate.
  useEffect(() => {
    if (!threadId || !currentUserId) return;
    if (markedThreadRef.current === threadId) return;
    markedThreadRef.current = threadId;
    void (async () => {
      try {
        const { error } = await supabase
          .from("messages")
          .update({ read_by_recipient_at: new Date().toISOString() })
          .eq("thread_id", threadId)
          .is("read_by_recipient_at", null)
          .neq("author_id", currentUserId);
        if (error) {
          console.warn("[ThreadView] mark-as-read failed (silent)", error);
        }
      } catch (err: unknown) {
        console.warn("[ThreadView] mark-as-read threw (silent)", err);
      }
    })();
  }, [threadId, currentUserId]);

  // Reset optimistic queue when switching threads.
  useEffect(() => {
    setOptimistic([]);
  }, [threadId]);

  // Autoscroll to newest on mount + when messages change.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [displayMessages]);

  const handleSend = async () => {
    if (!threadId || !currentUserId) return;
    // draft is HTML — guard against empty editor content (e.g. "<p></p>").
    const body = draft.trim();
    const plain = body.replace(/<[^>]*>/g, "").trim();
    if (plain.length === 0 || sending) return;

    // Optimistic append.
    const tempId = `pending-${Date.now()}`;
    const pending: OptimisticMessage = {
      id: tempId,
      thread_id: threadId,
      author_id: currentUserId,
      body,
      read_by_recipient_at: null,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    setOptimistic((prev) => [...prev, pending]);
    setDraft("");
    setSending(true);

    try {
      const { error: err } = await supabase
        .from("messages")
        .insert({ thread_id: threadId, author_id: currentUserId, body });
      if (err) throw err;
      await refresh();
      // Drop the pending placeholder — the refreshed list now contains the
      // real row. Keep any other pending sends that may have queued up.
      setOptimistic((prev) => prev.filter((m) => m.id !== tempId));
      if (ctx?.onMessageSent) await ctx.onMessageSent();
      toast.success("Message sent");
    } catch (err: unknown) {
      // Rollback: remove the optimistic message and restore the draft so the
      // user doesn't lose their work.
      setOptimistic((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(body);
      toast.error("Couldn't send message", getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-slate-50 dark:bg-slate-900"
      >
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-14 w-3/4 rounded-2xl" />
            <Skeleton className="h-14 w-2/3 rounded-2xl ml-auto" />
            <Skeleton className="h-14 w-3/5 rounded-2xl" />
          </div>
        )}
        {error && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}
        {!loading && !error && displayMessages.length === 0 && (
          <EmptyState
            title="No messages yet"
            body="Send the first one to get the conversation started."
          />
        )}
        {displayMessages.map((m) => {
          const mine = m.author_id === currentUserId;
          const pending = m._pending === true;
          return (
            <div
              key={m.id}
              className={[
                "flex flex-col",
                mine ? "items-end" : "items-start",
              ].join(" ")}
            >
              {/* Body is HTML produced by MarkdownEditor (legacy plain text still renders correctly). */}
              <SafeHtml
                html={m.body}
                className={[
                  "max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words prose prose-sm max-w-none",
                  mine
                    ? "bg-indigo-600 text-white rounded-br-sm prose-invert"
                    : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 ring-1 ring-slate-200 dark:ring-slate-700 rounded-bl-sm dark:prose-invert",
                  pending ? "opacity-60" : "",
                ].join(" ")}
              />
              <span className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                {pending ? "Sending…" : formatStamp(m.created_at)}
              </span>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="border-t border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-950"
      >
        <div className="flex gap-2 items-end">
          {/* Editor stores HTML — DB body column accepts string transparently. */}
          <div className="flex-1">
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              placeholder="Write a message…"
              minHeight={80}
              showToolbar
            />
          </div>
          <button
            type="submit"
            disabled={sending || draft.replace(/<[^>]*>/g, "").trim().length === 0}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-medium px-4 py-2"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
