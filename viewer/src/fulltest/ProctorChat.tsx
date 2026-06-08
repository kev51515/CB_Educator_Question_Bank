/**
 * ProctorChat — two-way proctor ⇄ student messaging for a paused live test
 * ========================================================================
 * Backed by migration 0113 (proctor_messages + the two send RPCs). Reads are
 * RLS-direct with a realtime subscription per run; writes go through the
 * role-appropriate RPC (the student RPC also enforces "paused only").
 *
 * `useProctorChat` is the data hook; `ProctorChat` is the shared thread + preset
 * chips + composer used by BOTH the student paused screen (role="student") and
 * the proctor monitor (role="staff").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";

export interface ProctorMessage {
  id: string;
  run_id: string;
  sender: "student" | "staff";
  sender_id: string | null;
  kind: "text" | "preset" | "pause";
  body: string;
  created_at: string;
}

export const STUDENT_PRESETS = [
  "Okay",
  "I have a question",
  "Need the restroom",
  "Technical issue",
  "Ready to resume",
];

export const STAFF_PRESETS = [
  "One moment",
  "On my way",
  "Come see me",
  "Resuming shortly",
  "Take your time",
];

interface UseProctorChat {
  messages: ProctorMessage[];
  loading: boolean;
  send: (kind: "text" | "preset", body: string) => Promise<boolean>;
}

const FRIENDLY: Record<string, string> = {
  not_paused: "You can only message while your test is paused.",
  run_already_submitted: "This test is no longer active.",
  not_authorized: "You can't message on this test.",
  invalid_message: "Type a message first.",
};

export function useProctorChat(
  runId: string | null,
  role: "student" | "staff",
): UseProctorChat {
  const toast = useToast();
  const [messages, setMessages] = useState<ProctorMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async (rid: string): Promise<void> => {
    const { data, error } = await supabase
      .from("proctor_messages")
      .select("id,run_id,sender,sender_id,kind,body,created_at")
      .eq("run_id", rid)
      .order("created_at", { ascending: true });
    if (!error) setMessages((data ?? []) as ProctorMessage[]);
  }, []);

  useEffect(() => {
    if (!runId) {
      setMessages([]);
      return;
    }
    let alive = true;
    setLoading(true);
    void fetchMessages(runId).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [runId, fetchMessages]);

  // Realtime: refetch on any insert for this run. Fetcher read off a ref so
  // callback identity flips don't tear down the channel (project pattern).
  const fetchRef = useRef(fetchMessages);
  fetchRef.current = fetchMessages;
  useEffect(() => {
    if (!runId) return;
    const channel = supabase
      .channel(`proctor_messages:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "proctor_messages",
          filter: `run_id=eq.${runId}`,
        },
        () => void fetchRef.current(runId),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [runId]);

  const send = useCallback(
    async (kind: "text" | "preset", body: string): Promise<boolean> => {
      if (!runId) return false;
      const trimmed = body.trim();
      if (!trimmed) return false;
      const fn =
        role === "student"
          ? "student_send_proctor_message"
          : "proctor_send_message";
      const { error } = await supabase.rpc(fn, {
        p_run_id: runId,
        p_kind: kind,
        p_body: trimmed,
      });
      if (error) {
        const code = Object.keys(FRIENDLY).find((c) => error.message.includes(c));
        toast.error("Couldn't send", code ? FRIENDLY[code] : error.message);
        return false;
      }
      void fetchMessages(runId); // optimistic-ish; realtime also refreshes
      return true;
    },
    [runId, role, toast, fetchMessages],
  );

  return { messages, loading, send };
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

interface ProctorChatProps {
  runId: string | null;
  role: "student" | "staff";
  /** Disable the composer (e.g. student is no longer paused). */
  disabled?: boolean;
  /** Shown when the thread is empty. */
  emptyHint?: string;
  className?: string;
}

/** Shared thread + preset chips + composer. */
export function ProctorChat({
  runId,
  role,
  disabled = false,
  emptyHint,
  className = "",
}: ProctorChatProps): JSX.Element {
  const { messages, send } = useProctorChat(runId, role);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const presets = role === "student" ? STUDENT_PRESETS : STAFF_PRESETS;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the thread pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Ref guard (not just the `sending` state) so a fast double-tap can't fire
  // two sends before the state flips.
  const sendingRef = useRef(false);
  const doSend = async (kind: "text" | "preset", body: string) => {
    if (sendingRef.current || disabled) return;
    sendingRef.current = true;
    setSending(true);
    const okSent = await send(kind, body);
    sendingRef.current = false;
    setSending(false);
    if (okSent && kind === "text") setDraft("");
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-1"
      >
        {messages.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
            {emptyHint ?? "No messages yet."}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender === role;
            const fromStaff = m.sender === "staff";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                    mine
                      ? "bg-indigo-600 text-white"
                      : fromStaff
                        ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                        : "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words leading-snug">{m.body}</p>
                  <p className={`mt-0.5 text-[10px] ${mine ? "text-indigo-200" : "text-slate-400 dark:text-slate-400"}`}>
                    {!mine && (fromStaff ? "Teacher · " : "Student · ")}
                    {fmtTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!disabled && (
        <div className="shrink-0 border-t border-slate-200 pt-2 dark:border-slate-800">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                disabled={sending}
                onClick={() => void doSend("preset", p)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {p}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doSend("text", draft);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void doSend("text", draft);
                }
              }}
              rows={1}
              maxLength={500}
              placeholder="Type a message…"
              className="max-h-24 min-h-[38px] flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
