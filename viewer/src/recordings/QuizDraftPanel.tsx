/**
 * QuizDraftPanel — generate a quiz from the recording (SAT-style or general),
 * then review/edit the drafted questions before publishing.
 *
 * Publishing into a student-takeable assignment is the one deferred step (it
 * couples to the assignment/runner system); the Publish button explains that.
 */
import { useState } from "react";
import { useToast } from "@/components";
import {
  deleteAuthoredQuestion,
  generateQuiz,
  updateAuthoredQuestion,
  useAuthoredQuestions,
} from "./useAuthoredQuestions";
import type { AuthoredQuestion, QuizStyle } from "./types";

const CHOICE_KEYS = ["A", "B", "C", "D"] as const;

function QuestionEditor({
  q,
  index,
  onChanged,
}: {
  q: AuthoredQuestion;
  index: number;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [stem, setStem] = useState(q.stem);
  const [choices, setChoices] = useState<Record<string, string>>(q.choices);
  const [correct, setCorrect] = useState(q.correct_answer ?? "A");
  const [rationale, setRationale] = useState(q.rationale ?? "");

  async function save(patch: Parameters<typeof updateAuthoredQuestion>[1]) {
    try {
      await updateAuthoredQuestion(q.id, patch);
    } catch (e) {
      toast.error(`Couldn't save: ${(e as Error).message}`);
    }
  }

  async function remove() {
    try {
      await deleteAuthoredQuestion(q.id);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">Q{index + 1}</span>
        <button
          type="button"
          onClick={() => void remove()}
          className="text-xs font-medium text-red-600 hover:underline"
        >
          Remove
        </button>
      </div>
      <textarea
        value={stem}
        onChange={(e) => setStem(e.target.value)}
        onBlur={() => stem !== q.stem && void save({ stem })}
        rows={2}
        className="w-full resize-y rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
        placeholder="Question stem"
      />
      <div className="mt-2 space-y-1">
        {CHOICE_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${q.id}`}
              checked={correct === k}
              onChange={() => {
                setCorrect(k);
                void save({ correct_answer: k });
              }}
              title="Mark correct"
            />
            <span className="w-4 text-xs font-medium text-slate-500">{k}</span>
            <input
              type="text"
              value={choices[k] ?? ""}
              onChange={(e) => setChoices({ ...choices, [k]: e.target.value })}
              onBlur={() =>
                choices[k] !== q.choices[k] && void save({ choices })
              }
              className={`flex-1 rounded-md border px-2 py-1 text-sm dark:bg-slate-800 ${
                correct === k
                  ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                  : "border-slate-300 dark:border-slate-600"
              }`}
            />
          </label>
        ))}
      </div>
      <input
        type="text"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        onBlur={() => rationale !== (q.rationale ?? "") && void save({ rationale })}
        placeholder="Rationale (why the answer is correct)"
        className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
      />
    </li>
  );
}

export function QuizDraftPanel({ recordingId }: { recordingId: string }) {
  const { questions, loading, refresh } = useAuthoredQuestions(recordingId);
  const toast = useToast();
  const [style, setStyle] = useState<QuizStyle>("sat");
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const n = await generateQuiz(recordingId, style);
      await refresh();
      toast.success(`Drafted ${n} question${n === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(`Couldn't generate a quiz: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quiz</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-xs dark:border-slate-700">
            {(["sat", "general"] as QuizStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                className={`px-2.5 py-1 font-medium ${
                  style === s
                    ? "bg-indigo-600 text-white"
                    : "bg-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {s === "sat" ? "SAT-style" : "General"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? "Generating…" : questions.length ? "Regenerate" : "Generate quiz"}
          </button>
        </div>
      </div>

      {loading ? null : questions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Pick a style and generate a quiz from this recording. You'll review and
          edit every question before it's published.
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {questions.map((q, i) => (
              <QuestionEditor key={q.id} q={q} index={i} onChanged={() => void refresh()} />
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {questions.length} draft question{questions.length === 1 ? "" : "s"}.
            </p>
            <button
              type="button"
              disabled
              title="Publishing to a student assignment is coming next."
              className="cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-400 dark:border-slate-700"
            >
              Publish to course… (soon)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
