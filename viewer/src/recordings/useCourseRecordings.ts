/**
 * useCourseRecordings — list the recordings linked to one course.
 *
 * Mirrors useRecordingsList in ./useRecordings (same shape, RECORDING_COLS, and
 * aliveRef guard per CLAUDE.md), but filters on `course_id`. Owner-only RLS still
 * applies, so only the signed-in owner's recordings for this course surface —
 * that's the intended MVP scope (no RLS change).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Recording } from "./types";

const RECORDING_COLS =
  "id, owner_id, course_id, domain, title, subject_type, consent_obtained, consent_note, status, duration_s, created_at, updated_at";

export interface UseCourseRecordings {
  recordings: Recording[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCourseRecordings(
  courseId: string | undefined,
): UseCourseRecordings {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    if (!courseId) {
      if (!aliveRef.current) return;
      setRecordings([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("recordings")
      .select(RECORDING_COLS)
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });
    if (!aliveRef.current) return;
    if (error) setError(error.message);
    else {
      setRecordings((data ?? []) as Recording[]);
      setError(null);
    }
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  // Poll while anything is still capturing/transcribing so the list's status
  // pills update without a manual refresh.
  useEffect(() => {
    const busy = recordings.some(
      (r) => r.status === "recording" || r.status === "processing",
    );
    if (!busy) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [recordings, load]);

  return { recordings, loading, error, refresh: load };
}
