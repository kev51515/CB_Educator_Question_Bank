// Student-facing survey block for a course module. Reads the student's own
// prior response on mount, then lets them answer (or change) by kind:
// scale (1..5 pills), choice (one button per option), or text (textarea).
// Violet/indigo calm tint. Tailwind + slate + dark mode.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";

type SurveyKind = "scale" | "choice" | "text";
type SurveyAnswer = number | string;

interface SurveyConfig {
  prompt?: string;
  kind?: SurveyKind;
  options?: string[];
}

export function SurveyBlock({
  itemId,
  title,
  config,
}: {
  itemId: string;
  title?: string;
  config: SurveyConfig;
}): JSX.Element {
  const toast = useToast();
  const aliveRef = useRef(true);
  const kind: SurveyKind = config.kind ?? "scale";

  const [answer, setAnswer] = useState<SurveyAnswer | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const { data } = await supabase
        .from("module_item_survey_responses")
        .select("answer")
        .eq("item_id", itemId)
        .maybeSingle();
      if (!aliveRef.current) return;
      const prior = (data?.answer ?? null) as SurveyAnswer | null;
      setAnswer(prior);
      setEditing(prior == null);
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [itemId]);

  async function submit(value: SurveyAnswer): Promise<void> {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("submit_survey_response", {
      p_item_id: itemId,
      p_answer: value,
    });
    if (!aliveRef.current) return;
    setBusy(false);
    if (error) {
      toast.error("Couldn't save your answer", error.message);
      return;
    }
    setAnswer(value);
    setEditing(false);
    toast.success("Answer recorded");
  }

  const answerLabel = answer == null ? "" : String(answer);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 ring-1 ring-violet-200/50 dark:border-violet-900 dark:bg-violet-950/30 dark:ring-violet-900/50 text-violet-900 dark:text-violet-200">
      {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
      {config.prompt ? (
        <p className="mt-0.5 text-xs text-violet-700/80 dark:text-violet-300/80">
          {config.prompt}
        </p>
      ) : null}

      {answer != null && !editing ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
            {answerLabel}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraft(kind === "text" ? answerLabel : "");
              setEditing(true);
            }}
            className="text-xs font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-300"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="mt-2">
          {kind === "scale" ? (
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(n)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-violet-300 bg-white text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/50"
                >
                  {n}
                </button>
              ))}
            </div>
          ) : null}

          {kind === "choice" ? (
            <div className="flex flex-col gap-1.5">
              {(config.options ?? []).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(opt)}
                  className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-left text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/50"
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : null}

          {kind === "text" ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-violet-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Your answer…"
              />
              <button
                type="button"
                disabled={busy || draft.trim() === ""}
                onClick={() => void submit(draft.trim())}
                className="self-start rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600"
              >
                Submit
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
