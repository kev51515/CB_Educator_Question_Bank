/**
 * useAttendance — loads per-student session balances for a course.
 * ================================================================
 * Wraps `getCourseSessionBalances(courseId)` with the standard aliveRef +
 * loading/error/refresh shape (mirrors useCourseSkillMastery). The teacher
 * Attendance tab consumes `rows` to render the roster × remaining table and
 * calls `refresh()` after a create/log/void mutation reconciles.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCourseSessionBalances,
  type SessionBalanceRow,
} from "./attendance";

export interface UseAttendance {
  rows: SessionBalanceRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAttendance(courseId: string): UseAttendance {
  const [rows, setRows] = useState<SessionBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCourseSessionBalances(courseId);
      if (!aliveRef.current) return;
      setRows(data);
    } catch (e) {
      if (aliveRef.current) {
        setError(e instanceof Error ? e.message : "Couldn't load attendance.");
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    return () => {
      aliveRef.current = false;
    };
  }, [refresh]);

  return { rows, loading, error, refresh };
}
