/**
 * AuthoredQuizRunner — the student runner for a published 'authored_set' quiz
 * (a recording-generated, teacher-reviewed MCQ set).
 *
 * STATUS: built but NOT yet wired into `AssignmentRunner` or routed — that
 * (plus the `assignments_kind_consistency` ALTER + `publish_authored_quiz`
 * RPC) is the deferred shared-assignment work. This component is dormant
 * scaffolding until those land; it's complete so wiring is a one-line branch.
 *
 * Flow: read answer-stripped questions via `get_authored_questions`, collect
 * one choice per question, submit via the server-graded `submit_authored_attempt`
 * (idempotent on a per-mount client_attempt_id), then show the score.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton, useToast } from "@/components";

interface RunnerQuestion {
  id: string;
  position: number;
  stem: string;
  choices: Record<string, string>;
}

interface AuthoredQuizRunnerProps {
  assignmentId: string;
  title?: string;
  onExit: () => void;
}

const CHOICE_KEYS = ["A", "B", "C", "D"] as const;

type Stage =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "taking" }
  | { kind: "done"; score: number; correct: number; total: number };

export function AuthoredQuizRunner({
  assignmentId,
  title,
  onExit,
}: AuthoredQuizRunnerProps) {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [questions, setQuestions] = useState<RunnerQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const clientAttemptIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_authored_questions", {
      p_assignment_id: assignmentId,
    });
    if (error) {
      setStage({ kind: "error", message: error.message });
      return;
    }
    setQuestions((data ?? []) as RunnerQuestion[]);
    setStage({ kind: "taking" });
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_authored_attempt", {
        p_assignment_id: assignmentId,
        p_client_attempt_id: clientAttemptIdRef.current,
        p_answers: answers,
      });
      if (error) throw error;
      // Re-read the graded attempt for the score.
      const { data: attempt } = await supabase
        .from("assignment_attempts")
        .select("score_percent, correct_count, total_questions")
        .eq("id", data as string)
        .single();
      setStage({
        kind: "done",
        score: Number(attempt?.score_percent ?? 0),
        correct: Number(attempt?.correct_count ?? 0),
        total: Number(attempt?.total_questions ?? questions.length),
      });
    } catch (e) {
      toast.error(`Couldn't submit: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (stage.kind === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Skeleton className="mb-3 h-7 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (stage.kind === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {stage.message}
        </div>
        <button onClick={onExit} className="mt-4 text-sm text-indigo-600 hover:underline">
          ← Back
        </button>
      </div>
    );
  }
  if (stage.kind === "done") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {stage.score}%
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {stage.correct} of {stage.total} correct
        </p>
        <button
          onClick={onExit}
          className="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Done
        </button>
      </div>
    );
  }

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {title && (
        <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      )}
      <ol className="space-y-5">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="mb-3 font-medium text-slate-900 dark:text-slate-100">
              <span className="mr-2 text-slate-400">{i + 1}.</span>
              {q.stem}
            </p>
            <div className="space-y-2">
              {CHOICE_KEYS.filter((k) => q.choices?.[k]).map((k) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    answers[q.id] === k
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                      : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === k}
                    onChange={() => setAnswers({ ...answers, [q.id]: k })}
                    className="mt-0.5"
                  />
                  <span className="font-medium text-slate-500">{k}</span>
                  <span className="text-slate-800 dark:text-slate-200">{q.choices[k]}</span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex items-center justify-between gap-3">
        <button onClick={onExit} className="text-sm text-slate-500 hover:underline">
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={!allAnswered || submitting}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
