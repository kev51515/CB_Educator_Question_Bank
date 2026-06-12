/**
 * Authored-questions data layer — the AI-drafted quiz built from a recording.
 * List + mutations + the generate invocation. Plain supabase + aliveRef guard.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AuthoredQuestion, QuizStyle } from "./types";

const COLS =
  "id, recording_id, owner_id, course_id, position, style, stem, choices, correct_answer, rationale, status, created_at, updated_at";

/** Ask Claude to (re)draft a quiz from the recording. Returns how many landed. */
export async function generateQuiz(
  recordingId: string,
  style: QuizStyle,
  count = 6,
): Promise<number> {
  const { data, error } = await supabase.functions.invoke(
    "generate-quiz-from-recording",
    { body: { recording_id: recordingId, style, count } },
  );
  if (error) throw error;
  return (data as { count?: number })?.count ?? 0;
}

export async function updateAuthoredQuestion(
  id: string,
  patch: Partial<
    Pick<AuthoredQuestion, "stem" | "choices" | "correct_answer" | "rationale">
  >,
): Promise<void> {
  const { error } = await supabase
    .from("authored_questions")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAuthoredQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from("authored_questions")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export interface UseAuthoredQuestions {
  questions: AuthoredQuestion[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useAuthoredQuestions(recordingId: string): UseAuthoredQuestions {
  const [questions, setQuestions] = useState<AuthoredQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("authored_questions")
      .select(COLS)
      .eq("recording_id", recordingId)
      .order("position", { ascending: true });
    if (!aliveRef.current) return;
    setQuestions((data ?? []) as AuthoredQuestion[]);
    setLoading(false);
  }, [recordingId]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  return { questions, loading, refresh: load };
}
