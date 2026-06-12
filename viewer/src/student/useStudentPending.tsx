/**
 * useStudentPending — per-course "pending / new" counts for the student UI.
 *
 * One provider (mounted in StudentShell) fetches `get_student_pending_counts`
 * (migration 0201) and shares the result with every consumer: the sidebar
 * Courses badge, the mobile tab dot, the per-course "new" pills in
 * MyClassesPanel, and the Home indicators. Counts are DB-backed (seen state
 * lives in `student_course_seen`), so they survive across devices.
 *
 * Per-course total deliberately excludes `dueSoon`: every due-soon item is
 * already counted in `unstartedAssignments`, so adding it would double-count.
 * `dueSoon` exists for urgency copy/styling ("2 due soon").
 *
 * `markCourseSeen` is optimistic: the seen-gated counts (announcements,
 * items, grades) zero out locally first, then the RPC persists and a
 * background refresh reconciles. Unstarted work is NOT seen-gated — it clears
 * by submitting, not by looking.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

export interface CoursePendingCounts {
  newAnnouncements: number;
  newItems: number;
  unstartedAssignments: number;
  dueSoon: number;
  newGrades: number;
}

export function coursePendingTotal(c: CoursePendingCounts): number {
  return c.newAnnouncements + c.newItems + c.unstartedAssignments + c.newGrades;
}

interface PendingCountsRow {
  course_id: string;
  new_announcements: number;
  new_items: number;
  unstarted_assignments: number;
  due_soon: number;
  new_grades: number;
}

export interface StudentPendingValue {
  /** course_id → counts. Courses with all-zero counts may be absent. */
  byCourse: Record<string, CoursePendingCounts>;
  /** Sum of per-course totals — drives the sidebar/tab Courses badge. */
  totalPending: number;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Persist "I looked at this course" + optimistically clear its seen-gated counts. */
  markCourseSeen: (courseId: string) => Promise<void>;
}

const defaultValue: StudentPendingValue = {
  byCourse: {},
  totalPending: 0,
  loading: false,
  refresh: async () => {},
  markCourseSeen: async () => {},
};

const StudentPendingContext = createContext<StudentPendingValue>(defaultValue);

export function useStudentPending(): StudentPendingValue {
  return useContext(StudentPendingContext);
}

interface StudentPendingProviderProps {
  children: ReactNode;
}

export function StudentPendingProvider({ children }: StudentPendingProviderProps) {
  const [byCourse, setByCourse] = useState<Record<string, CoursePendingCounts>>({});
  const [loading, setLoading] = useState(true);
  // Guard async setState after unmount (CLAUDE.md aliveRef pattern, Wave 21J).
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const { data, error } = await supabase.rpc("get_student_pending_counts");
      if (!aliveRef.current) return;
      if (error) {
        // Non-student callers (or a not-yet-applied migration) just see no
        // badges — silence beats a toast on every page for a passive signal.
        setByCourse({});
        return;
      }
      const rows = (data ?? []) as PendingCountsRow[];
      const next: Record<string, CoursePendingCounts> = {};
      for (const row of rows) {
        next[row.course_id] = {
          newAnnouncements: row.new_announcements,
          newItems: row.new_items,
          unstartedAssignments: row.unstarted_assignments,
          dueSoon: row.due_soon,
          newGrades: row.new_grades,
        };
      }
      setByCourse(next);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  // Initial load + re-sync whenever the tab returns to the foreground (the
  // teacher may have posted while the student was away).
  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const markCourseSeen = useCallback(
    async (courseId: string): Promise<void> => {
      setByCourse((prev) => {
        const current = prev[courseId];
        if (!current) return prev;
        return {
          ...prev,
          [courseId]: {
            ...current,
            newAnnouncements: 0,
            newItems: 0,
            newGrades: 0,
          },
        };
      });
      const { error } = await supabase.rpc("mark_course_seen", {
        p_course_id: courseId,
      });
      // Reconcile against the server either way; on error the badge simply
      // reappears (correct — the seen marker didn't persist).
      if (!error) await refresh();
      else void refresh();
    },
    [refresh],
  );

  const totalPending = useMemo(
    () =>
      Object.values(byCourse).reduce(
        (sum, counts) => sum + coursePendingTotal(counts),
        0,
      ),
    [byCourse],
  );

  const value = useMemo<StudentPendingValue>(
    () => ({ byCourse, totalPending, loading, refresh, markCourseSeen }),
    [byCourse, totalPending, loading, refresh, markCourseSeen],
  );

  return (
    <StudentPendingContext.Provider value={value}>
      {children}
    </StudentPendingContext.Provider>
  );
}
