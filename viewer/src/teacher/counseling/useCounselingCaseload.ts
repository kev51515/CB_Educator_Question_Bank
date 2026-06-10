/**
 * useCounselingCaseload — one course-level roll-up across the whole counseling
 * caseload via the `counseling_caseload` RPC (migration 0135). One round-trip;
 * `refresh()` re-pulls.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface CaseloadStudent {
  id: string;
  display_name: string | null;
  email: string;
  applications_total: number;
  applications_submitted: number;
  applications_accepted: number;
  next_deadline: string | null;
  docs_missing: number;
  tasks_open: number;
  tasks_overdue: number;
  last_meeting: string | null;
}

export interface CaseloadTotals {
  students: number;
  applications: number;
  by_status: Record<string, number> | null;
  by_plan: Record<string, number> | null;
  upcoming_deadlines_14d: number;
  docs_missing: number;
  tasks_open: number;
  tasks_overdue: number;
}

export interface Caseload {
  students: CaseloadStudent[];
  // The RPC always returns a totals object for a real course, but the local
  // fallback below seeds it null before the first round-trip resolves; callers
  // must tolerate null (use optional chaining + defaults).
  totals: CaseloadTotals | null;
}

interface UseCounselingCaseload {
  data: Caseload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCounselingCaseload(courseId: string | null): UseCounselingCaseload {
  const [data, setData] = useState<Caseload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data: res, error: rpcError } = await supabase.rpc("counseling_caseload", {
      p_course_id: courseId,
    });
    if (!aliveRef.current) return;
    if (rpcError) {
      setData(null);
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    setData((res ?? { students: [], totals: null }) as unknown as Caseload);
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
