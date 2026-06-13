/**
 * AI study-aids data layer — fetch the 1:1 recording_study_aids row + the
 * owner-triggered generate invocation. Plain supabase + aliveRef guard, mirrors
 * useAuthoredQuestions.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Flashcard, GlossaryEntry, RecordingStudyAids } from "./studyAids";

const COLS =
  "recording_id, flashcards, study_guide, glossary, model, generated_at";

/** Ask Gemini to (re)build study aids from the recording. Returns the saved row. */
export async function generateStudyAids(
  recordingId: string,
): Promise<RecordingStudyAids> {
  const { data, error } = await supabase.functions.invoke(
    "generate-study-aids-from-recording",
    { body: { recording_id: recordingId } },
  );
  if (error) throw error;
  return (data as { study_aids: RecordingStudyAids }).study_aids;
}

function normalize(
  row: Record<string, unknown> | null,
): RecordingStudyAids | null {
  if (!row) return null;
  return {
    recording_id: String(row.recording_id),
    flashcards: (Array.isArray(row.flashcards) ? row.flashcards : []) as Flashcard[],
    study_guide:
      typeof row.study_guide === "string" ? row.study_guide : null,
    glossary: (Array.isArray(row.glossary) ? row.glossary : []) as GlossaryEntry[],
    model: typeof row.model === "string" ? row.model : null,
    generated_at: String(row.generated_at ?? ""),
  };
}

export interface UseStudyAids {
  aids: RecordingStudyAids | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useStudyAids(recordingId: string): UseStudyAids {
  const [aids, setAids] = useState<RecordingStudyAids | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("recording_study_aids")
      .select(COLS)
      .eq("recording_id", recordingId)
      .maybeSingle();
    if (!aliveRef.current) return;
    setError(e ? e.message : null);
    setAids(normalize((data as Record<string, unknown> | null) ?? null));
    setLoading(false);
  }, [recordingId]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  return { aids, loading, error, refresh: load };
}
