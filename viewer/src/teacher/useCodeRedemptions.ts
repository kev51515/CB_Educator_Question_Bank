/**
 * useCodeRedemptions — durable, cumulative log of shared class-code redemptions
 * for a course (migration 0097). Unlike a roster-derived count, this persists
 * after a student is removed (rows snapshot name+email; student_id is set NULL),
 * so it answers "how many times has the class code been used, by whom, when, and
 * how (join vs. quick-start)".
 *
 * RLS restricts rows to the course's teacher (or admins).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type RedemptionMethod = "join" | "quick_start";

export interface CodeRedemption {
  id: string;
  student_id: string | null;
  code_used: string;
  method: RedemptionMethod;
  name_snapshot: string | null;
  email_snapshot: string | null;
  created_at: string;
}

export interface CodeRedemptionStats {
  /** Total times the class code was successfully redeemed. */
  total: number;
  /** Distinct redeemers (each removed/unknown student counts individually). */
  students: number;
  /** ISO timestamp of the most recent redemption, or null. */
  lastUsed: string | null;
  joinCount: number;
  quickStartCount: number;
}

export interface UseCodeRedemptions {
  redemptions: CodeRedemption[];
  stats: CodeRedemptionStats;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EMPTY_STATS: CodeRedemptionStats = {
  total: 0,
  students: 0,
  lastUsed: null,
  joinCount: 0,
  quickStartCount: 0,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load code activity.";
}

function computeStats(rows: CodeRedemption[]): CodeRedemptionStats {
  if (rows.length === 0) return EMPTY_STATS;
  const distinct = new Set<string>();
  let nullStudents = 0;
  let joinCount = 0;
  let quickStartCount = 0;
  for (const r of rows) {
    if (r.student_id) distinct.add(r.student_id);
    else nullStudents += 1;
    if (r.method === "join") joinCount += 1;
    else if (r.method === "quick_start") quickStartCount += 1;
  }
  return {
    total: rows.length,
    students: distinct.size + nullStudents,
    lastUsed: rows[0]?.created_at ?? null, // rows arrive newest-first
    joinCount,
    quickStartCount,
  };
}

export function useCodeRedemptions(courseId: string | null): UseCodeRedemptions {
  const [redemptions, setRedemptions] = useState<CodeRedemption[]>([]);
  const [stats, setStats] = useState<CodeRedemptionStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseId) {
      setRedemptions([]);
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from("code_redemptions")
        .select("id, student_id, code_used, method, name_snapshot, email_snapshot, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });

      if (queryError) {
        setRedemptions([]);
        setStats(EMPTY_STATS);
        setError(queryError.message);
        return;
      }
      const rows = (data ?? []) as CodeRedemption[];
      setRedemptions(rows);
      setStats(computeStats(rows));
      setError(null);
    } catch (err: unknown) {
      setRedemptions([]);
      setStats(EMPTY_STATS);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { redemptions, stats, loading, error, refresh };
}
