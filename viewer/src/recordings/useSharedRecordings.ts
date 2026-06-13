/**
 * useSharedRecordings — student-facing list of recordings that teachers /
 * counselors shared into a course the student is enrolled in.
 *
 * A student owns no recordings, and migration 0225 added an additive
 * shared-read RLS policy that lets an enrolled student SELECT a recording
 * shared to one of their courses. So a plain
 * `supabase.from("recordings").select(...)` returns exactly the recordings
 * shared to them — no owner filter needed. Async setState is guarded with an
 * `aliveRef` flag per CLAUDE.md (see Wave 21J).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Recording } from "./types";

// Mirrors RECORDING_COLS in useRecordings.ts (kept local so this read-only
// student hook doesn't depend on a non-exported const in that file).
const RECORDING_COLS =
  "id, owner_id, course_id, domain, title, subject_type, consent_obtained, consent_note, status, duration_s, created_at, updated_at";

export interface UseSharedRecordings {
  recordings: Recording[];
  loading: boolean;
  error: string | null;
}

export function useSharedRecordings(): UseSharedRecordings {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("recordings")
      .select(RECORDING_COLS)
      .order("created_at", { ascending: false });
    if (!aliveRef.current) return;
    if (error) setError(error.message);
    else {
      setRecordings((data ?? []) as Recording[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  return { recordings, loading, error };
}
