/**
 * CounselorAiCard — COUNSELOR-ONLY AI assistant (essay feedback + rec-letter
 * draft). Rendered on the teacher-side StudentProfilePage for counseling
 * courses, so students never see it (AI is counselor-only by design).
 *
 * Calls the `counselor-ai` edge function, which authorizes the caller as a
 * teacher of the course / admin and calls the LLM with a server-side key.
 * Degrades gracefully when the function isn't configured/deployed yet.
 */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";

type Mode = "essay_feedback" | "rec_letter";

const MODES: { value: Mode; label: string; placeholder: string; cta: string }[] = [
  {
    value: "essay_feedback",
    label: "Essay feedback",
    placeholder: "Paste the student's draft essay here…",
    cta: "Get feedback",
  },
  {
    value: "rec_letter",
    label: "Rec letter draft",
    placeholder:
      "Paste your notes / brag sheet about the student (strengths, anecdotes, role, impact)…",
    cta: "Draft letter",
  },
];

function friendly(code: string | undefined): string | null {
  switch (code) {
    case "ai_not_configured":
      return "The AI assistant isn't set up yet — an admin needs to deploy the counselor-ai function and set ANTHROPIC_API_KEY.";
    case "not_authorized":
      return "You're not authorized to use AI for this course.";
    case "invalid_input":
      return "Add a bit more text first.";
    case "input_too_long":
      return "That's too long — trim it and try again.";
    case "ai_error":
    case "server_error":
      return "The AI service hit an error. Try again in a moment.";
    default:
      return null;
  }
}

export function CounselorAiCard({ courseId }: { courseId: string }) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("essay_feedback");
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  const active = MODES.find((m) => m.value === mode)!;

  const run = async (): Promise<void> => {
    if (text.trim().length < 10) {
      toast.error("Add more text first");
      return;
    }
    setBusy(true);
    setResult("");
    const { data, error } = await supabase.functions.invoke("counselor-ai", {
      body: { mode, course_id: courseId, text },
    });
    setBusy(false);

    if (error) {
      let code: string | undefined;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) code = (await ctx.json())?.error;
      } catch {
        /* ignore parse */
      }
      toast.error("Counselor AI", friendly(code) ?? "Request failed.");
      return;
    }
    const code = (data as { error?: string })?.error;
    if (code) {
      toast.error("Counselor AI", friendly(code) ?? code);
      return;
    }
    const out = (data as { result?: string })?.result ?? "";
    if (!out) {
      toast.error("Counselor AI", "No response — try again.");
      return;
    }
    setResult(out);
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(result);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <section className="rounded-2xl ring-1 ring-violet-200 dark:ring-violet-900 bg-violet-50/40 dark:bg-violet-950/20 px-5 py-5 space-y-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
          Counselor AI
        </h3>
        <p className="text-xs text-violet-700/80 dark:text-violet-300/80">
          Draft feedback and letters faster — you stay the author. Not shown to
          students.
        </p>
      </header>

      {/* Mode toggle */}
      <div className="inline-flex rounded-lg ring-1 ring-violet-200 dark:ring-violet-900 overflow-hidden">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={mode === m.value}
            onClick={() => {
              setMode(m.value);
              setResult("");
            }}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m.value
                ? "bg-violet-600 text-white"
                : "bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/40"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={active.placeholder}
        rows={6}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
      />

      <div className="flex items-center justify-end gap-3">
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {text.trim().length} chars
        </span>
        <button
          type="button"
          disabled={busy || text.trim().length < 10}
          onClick={() => void run()}
          className="rounded-md bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-2 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Working…" : active.cta}
        </button>
      </div>

      {result && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Draft — review &amp; edit before using
            </span>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Copy
            </button>
          </div>
          <textarea
            value={result}
            onChange={(e) => setResult(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      )}
    </section>
  );
}
