// Student-facing AI Study Coach chat panel.
// Stateless server: the thread lives in React state and we send the last few
// turns with each call to the `study-coach` edge function. Bubbles styled like
// the proctor chat (user right/accent, coach left/slate). Tailwind + slate +
// dark mode. No dangerouslySetInnerHTML — coach text is whitespace-pre-wrap.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";

type Role = "user" | "coach";

interface Turn {
  role: Role;
  content: string;
}

interface CoachResponse {
  answer?: string;
  error?: string;
}

const STARTERS: readonly string[] = [
  "What should I study next?",
  "Why do I keep missing these?",
  "Am I on track for my goal?",
];

const RATE_LIMIT_MSG =
  "You've asked a lot just now — give it a minute, then try again.";

export function StudyCoachPanel({ className }: { className?: string }): JSX.Element {
  const toast = useToast();
  const aliveRef = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, busy]);

  async function send(question: string): Promise<void> {
    const q = question.trim();
    if (!q || busy) return;

    const history = turns.slice(-6).map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setDraft("");
    setBusy(true);

    const { data, error } = await supabase.functions.invoke<CoachResponse>("study-coach", {
      body: { question: q, history },
    });

    if (!aliveRef.current) return;
    setBusy(false);

    const rateLimited = error != null || data?.error === "rate_limited";
    if (rateLimited && data?.error === "rate_limited") {
      setTurns((prev) => [...prev, { role: "coach", content: RATE_LIMIT_MSG }]);
      toast.error("Slow down a moment", "Too many questions in a short window.");
      return;
    }
    if (error || !data?.answer) {
      setTurns((prev) => [
        ...prev,
        { role: "coach", content: "Sorry — I couldn't answer that just now. Try again in a moment." },
      ]);
      toast.error("Study coach is unavailable", error?.message);
      return;
    }

    setTurns((prev) => [...prev, { role: "coach", content: data.answer ?? "" }]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  }

  return (
    <div
      className={`flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className ?? ""}`}
    >
      {/* header */}
      <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Study coach</h3>
          <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-medium text-accent-700 ring-1 ring-accent-200 dark:bg-accent-950/40 dark:text-accent-300 dark:ring-accent-900/60">
            AI · grounded in your data
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Ask about your scores, weak skills, or what to study next.
        </p>
      </div>

      {/* message list */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try one of these to get started:
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(s)}
                  className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  t.role === "user"
                    ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent-600 px-3 py-2 text-sm text-white"
                    : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                }
              >
                {t.content}
              </div>
            </div>
          ))
        )}

        {busy ? (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                Coach is thinking
                <span className="inline-flex gap-0.5">
                  <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400" />
                </span>
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* input row */}
      <div className="shrink-0 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            rows={2}
            placeholder="Ask your coach…  (Enter to send, Shift+Enter for a new line)"
            className="min-h-[40px] flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={busy || draft.trim() === ""}
            onClick={() => void send(draft)}
            className="h-10 shrink-0 rounded-lg bg-accent-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          Estimates from your own practice data — not a guarantee.
        </p>
      </div>
    </div>
  );
}
