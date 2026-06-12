/**
 * useAssignmentRoster — cohort feed for one assignment, powering the educator
 * AssignmentOverviewPage (cohort stats + live Monitor + results release).
 *
 * Calls assignment_roster_status (migration 0209): one row per enrolled student
 * with their best submitted attempt's effective score, submit time, release
 * state, and whether they have a live in-progress attempt. Polls every POLL_MS
 * while the tab is visible so "in progress" stays current without a realtime
 * subscription (assignment runners have no heartbeat — see CLAUDE notes).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface RosterRow {
  student_id: string;
  student_name: string | null;
  attempt_id: string | null;
  effective_score: number | null;
  submitted_at: string | null;
  results_released_at: string | null;
  has_in_progress: boolean;
  started_at: string | null;
  /** Live position (1-based) of the in-progress attempt; null for qbank/idle. */
  current_question: number | null;
  /** Last heartbeat from the in-progress attempt (0214). */
  last_seen_at: string | null;
}

export interface CohortStats {
  assigned: number;
  submitted: number;
  inProgress: number;
  notStarted: number;
  released: number;
  avg: number | null;
  top: number | null;
  low: number | null;
}

const POLL_MS = 15_000;

function computeStats(rows: RosterRow[]): CohortStats {
  const assigned = rows.length;
  const submittedRows = rows.filter((r) => r.submitted_at !== null);
  const submitted = submittedRows.length;
  // "In progress" = has a live attempt AND hasn't got a submitted one.
  const inProgress = rows.filter((r) => r.submitted_at === null && r.has_in_progress).length;
  const notStarted = assigned - submitted - inProgress;
  const released = submittedRows.filter((r) => r.results_released_at !== null).length;
  const scores = submittedRows
    .map((r) => (r.effective_score === null ? null : Number(r.effective_score)))
    .filter((n): n is number => n !== null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const top = scores.length ? Math.max(...scores) : null;
  const low = scores.length ? Math.min(...scores) : null;
  return { assigned, submitted, inProgress, notStarted, released, avg, top, low };
}

export function useAssignmentRoster(assignmentId: string | null): {
  rows: RosterRow[];
  stats: CohortStats;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async (): Promise<void> => {
    if (!assignmentId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error: rpcError } = await supabase.rpc("assignment_roster_status", {
      p_assignment_id: assignmentId,
    });
    if (!aliveRef.current) return;
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setError(null);
      setRows((data ?? []) as RosterRow[]);
    }
    setLoading(false);
  }, [assignmentId]);

  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  const stats = useMemo(() => computeStats(rows), [rows]);

  return { rows, stats, loading, error, refresh: () => void load() };
}
