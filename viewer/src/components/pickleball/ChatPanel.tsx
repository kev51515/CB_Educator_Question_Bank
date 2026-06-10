/**
 * ChatPanel — Pickleball community chat (realtime).
 * ===================================================
 * A single per-course message stream shared by both the player and coach
 * tracks. Backed by migration 0155 (pickleball_chat_messages + the two pk_*
 * RPCs). Reads are RLS-direct (joined to profiles for the sender name); a
 * realtime channel subscribed on INSERT filtered by course_id appends new
 * messages live. Posting goes through pk_post_chat_message (optimistic — the
 * row is appended locally, then reconciled when the realtime echo lands).
 *
 * `canModerate` (true for the teacher view) lets the viewer soft-delete ANY
 * message via pk_delete_chat_message; otherwise only the author's own.
 *
 * Prop contract (do not change):
 *   export function ChatPanel({ courseId, selfId, canModerate }: {
 *     courseId: string; selfId: string; canModerate?: boolean })
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { Skeleton } from "@/components";

interface ChatMessage {
  id: string;
  course_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  sender_name: string | null;
}

const PAGE_SIZE = 50;

const FRIENDLY: Record<string, string> = {
  not_authenticated: "You need to sign in to chat.",
  not_authorized: "You're not a member of this course.",
  not_found: "That message no longer exists.",
  invalid_input: "Type a message first.",
};

function friendly(message: string): string {
  const code = Object.keys(FRIENDLY).find((c) => message.includes(c));
  return code ? FRIENDLY[code] : message;
}

/** Relative timestamp ("just now", "5m", "2h", "3d") with a clock fallback. */
function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function fmtClock(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function initialsOf(name: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Normalize a select() row. Supabase returns the joined relation as either an
 * object or an array depending on the relationship inference; handle both.
 */
function toMessage(row: unknown): ChatMessage | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.course_id !== "string" ||
    typeof r.sender_id !== "string" ||
    typeof r.body !== "string" ||
    typeof r.created_at !== "string"
  ) {
    return null;
  }
  let senderName: string | null = null;
  const sender = r.sender;
  if (sender && typeof sender === "object") {
    const s = Array.isArray(sender) ? sender[0] : sender;
    if (s && typeof s === "object") {
      const dn = (s as Record<string, unknown>).display_name;
      if (typeof dn === "string") senderName = dn;
    }
  } else if (typeof r.sender_name === "string") {
    senderName = r.sender_name;
  }
  return {
    id: r.id,
    course_id: r.course_id,
    sender_id: r.sender_id,
    body: r.body,
    created_at: r.created_at,
    deleted_at: typeof r.deleted_at === "string" ? r.deleted_at : null,
    sender_name: senderName,
  };
}

export function ChatPanel({
  courseId,
  selfId,
  canModerate,
}: {
  courseId: string;
  selfId: string;
  canModerate?: boolean;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);

  // Stable "merge a single row" helper so the realtime echo + optimistic post
  // don't produce duplicates (dedupe by id) and stay sorted by created_at.
  const mergeOne = useCallback((next: ChatMessage) => {
    if (next.deleted_at) {
      setMessages((prev) => prev.filter((m) => m.id !== next.id));
      return;
    }
    setMessages((prev) => {
      const without = prev.filter((m) => m.id !== next.id);
      const merged = [...without, next];
      merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return merged;
    });
  }, []);

  const fetchRecent = useCallback(async (): Promise<void> => {
    const { data, error } = await supabase
      .from("pickleball_chat_messages")
      .select(
        "id,course_id,sender_id,body,created_at,deleted_at,sender:profiles!pickleball_chat_messages_sender_id_fkey(display_name)",
      )
      .eq("course_id", courseId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (!aliveRef.current) return;
    if (error) {
      toast.error("Couldn't load chat", friendly(error.message));
      setMessages([]);
      return;
    }
    const rows = (data ?? [])
      .map(toMessage)
      .filter((m): m is ChatMessage => m !== null)
      // selected newest-first for the limit; flip to chronological for display.
      .reverse();
    setMessages(rows);
  }, [courseId, toast]);

  // Initial load.
  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);
    void fetchRecent().finally(() => {
      if (aliveRef.current) setLoading(false);
    });
    return () => {
      aliveRef.current = false;
    };
  }, [fetchRecent]);

  // Realtime: append on INSERT for this course. The handler reads off a ref so
  // the subscribe effect depends only on courseId and the channel isn't torn
  // down + recreated on every callback identity flip (project pattern).
  const mergeRef = useRef(mergeOne);
  mergeRef.current = mergeOne;
  useEffect(() => {
    const channel = supabase
      .channel(`pk_chat:${courseId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pickleball_chat_messages",
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          const next = toMessage(payload.new);
          if (next) mergeRef.current(next);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pickleball_chat_messages",
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          const next = toMessage(payload.new);
          if (next) mergeRef.current(next);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [courseId]);

  // Auto-scroll to newest when the message list grows.
  const count = messages.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const submit = useCallback(async (): Promise<void> => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    const { data, error } = await supabase.rpc("pk_post_chat_message", {
      p_course_id: courseId,
      p_body: body,
    });
    if (!aliveRef.current) return;
    setPosting(false);
    if (error) {
      toast.error("Couldn't send", friendly(error.message));
      return;
    }
    setDraft("");
    // Optimistic append (the realtime echo will dedupe by id). The RPC returns
    // the row sans the joined name, so use "You" until the join refresh lands.
    const posted = toMessage(data);
    if (posted) {
      mergeOne({ ...posted, sender_name: posted.sender_name ?? "You" });
    }
  }, [draft, posting, courseId, toast, mergeOne]);

  const onFormSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void submit();
    },
    [submit],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter inserts a newline.
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic remove, roll back on failure.
      const prev = messages;
      setMessages((cur) => cur.filter((m) => m.id !== id));
      const { error } = await supabase.rpc("pk_delete_chat_message", {
        p_id: id,
      });
      if (error) {
        if (aliveRef.current) setMessages(prev);
        toast.error("Couldn't delete", friendly(error.message));
        return;
      }
      toast.success("Message deleted");
    },
    [messages, toast],
  );

  const canDelete = useCallback(
    (m: ChatMessage): boolean => Boolean(canModerate) || m.sender_id === selfId,
    [canModerate, selfId],
  );

  const draftEmpty = draft.trim().length === 0;
  const headerLabel = useMemo(
    () => (count === 1 ? "1 message" : `${count} messages`),
    [count],
  );

  return (
    <div className="flex flex-col rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Community chat
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {loading ? " " : headerLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[16rem] max-h-[28rem]"
      >
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32 rounded" />
                  <Skeleton className="h-4 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <span
              aria-hidden="true"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 mb-3"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              No messages yet
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
              Start the conversation — say hello to your course below.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const mine = m.sender_id === selfId;
              const name = mine ? "You" : m.sender_name ?? "Member";
              return (
                <li key={m.id} className="group flex gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  >
                    {initialsOf(m.sender_name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {name}
                      </span>
                      <time
                        dateTime={m.created_at}
                        title={fmtClock(m.created_at)}
                        className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0"
                      >
                        {fmtRelative(m.created_at)}
                      </time>
                      {canDelete(m) && (
                        <button
                          type="button"
                          onClick={() => void remove(m.id)}
                          aria-label="Delete message"
                          title="Delete message"
                          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                      {m.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={onFormSubmit}
        className="flex items-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Write a message…"
          aria-label="Write a message"
          className="flex-1 resize-none rounded-xl bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[40px] max-h-32"
        />
        <button
          type="submit"
          disabled={draftEmpty || posting}
          className="inline-flex h-10 min-w-[40px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
          <span className="hidden sm:inline">{posting ? "Sending…" : "Send"}</span>
        </button>
      </form>
    </div>
  );
}
