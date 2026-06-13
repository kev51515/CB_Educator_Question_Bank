/**
 * useCourseSkillMastery — class-wide cross-test skill rollup for a course
 * ======================================================================
 * Fetches the `course_skill_mastery` RPC (0123) and shapes it for display:
 * per-section domain groups (canonical order, with %s), the flat list, and the
 * single weakest domain. Shared by the full "Skills" tab (ClassSkillsView) and
 * the compact summary card on the course Overview so the fetch + grouping live
 * in one place.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  groupDomainRows,
  weakestDomain,
  type SkillDomainRow,
  type SkillDomainStat,
  type SkillSectionGroup,
} from "@/fulltest/skills";

export interface Mastery {
  students: number;
  tests: number;
  attempts: number;
  domains: SkillDomainRow[];
}

export interface CourseSkillMastery {
  loading: boolean;
  error: string | null;
  mastery: Mastery | null;
  grouped: SkillSectionGroup[];
  all: SkillDomainStat[];
  weakest: SkillDomainStat | null;
}

export function useCourseSkillMastery(courseId: string): CourseSkillMastery {
  const [mastery, setMastery] = useState<Mastery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const alive = { current: true };
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { data, error: err } = await supabase.rpc("course_skill_mastery", { p_course_id: courseId });
        if (!alive.current) return;
        if (err) throw err;
        setMastery(data as Mastery);
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : "Could not load class skills.");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [courseId]);

  const grouped = useMemo(() => groupDomainRows(mastery?.domains ?? []), [mastery]);
  const all = useMemo(() => grouped.flatMap((g) => g.domains), [grouped]);
  const weakest = useMemo(() => weakestDomain(grouped), [grouped]);

  return { loading, error, mastery, grouped, all, weakest };
}

/** One per-(student, section, domain) tally from the `course_skill_by_student` RPC (0238). */
export interface StudentSkillRow extends SkillDomainRow {
  student_id: string;
  student_name: string;
}

export interface CourseSkillByStudent {
  loading: boolean;
  error: string | null;
  rows: StudentSkillRow[];
}

/**
 * useCourseSkillByStudent — per-student drill-down for the Class skills tab.
 * Returns one row per (student, section, domain); the view filters by the
 * clicked domain client-side. Mirrors useCourseSkillMastery's fetch + aliveRef.
 */
export function useCourseSkillByStudent(courseId: string): CourseSkillByStudent {
  const [rows, setRows] = useState<StudentSkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const alive = { current: true };
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { data, error: err } = await supabase.rpc("course_skill_by_student", {
          p_course_id: courseId,
        });
        if (!alive.current) return;
        if (err) throw err;
        setRows((data as StudentSkillRow[]) ?? []);
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : "Could not load student skills.");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [courseId]);

  return { loading, error, rows };
}
