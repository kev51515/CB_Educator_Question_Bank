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
import { orderDomains, orderSections, pctOf } from "@/fulltest/skills";

export interface DomainRow {
  section: string;
  domain: string;
  correct: number;
  total: number;
}
export interface Mastery {
  students: number;
  tests: number;
  attempts: number;
  domains: DomainRow[];
}
export interface DomainStat {
  domain: string;
  correct: number;
  total: number;
  pct: number;
}
export interface SectionGroup {
  section: string;
  domains: DomainStat[];
}

export interface CourseSkillMastery {
  loading: boolean;
  error: string | null;
  mastery: Mastery | null;
  grouped: SectionGroup[];
  all: DomainStat[];
  weakest: DomainStat | null;
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

  const grouped = useMemo<SectionGroup[]>(() => {
    const rows = mastery?.domains ?? [];
    const bySection = new Map<string, Map<string, DomainRow>>();
    for (const r of rows) {
      if (!bySection.has(r.section)) bySection.set(r.section, new Map());
      bySection.get(r.section)!.set(r.domain, r);
    }
    return orderSections(bySection.keys()).map((sec) => {
      const byName = bySection.get(sec)!;
      return {
        section: sec,
        domains: orderDomains(sec, byName.keys()).map((name) => {
          const r = byName.get(name)!;
          return { domain: name, correct: r.correct, total: r.total, pct: pctOf(r.correct, r.total) ?? 0 };
        }),
      };
    });
  }, [mastery]);

  const all = useMemo(() => grouped.flatMap((g) => g.domains), [grouped]);
  const weakest = useMemo(
    () => all.reduce<DomainStat | null>((w, d) => (!w || d.pct < w.pct ? d : w), null),
    [all],
  );

  return { loading, error, mastery, grouped, all, weakest };
}
