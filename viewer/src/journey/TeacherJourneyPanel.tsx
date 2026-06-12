/**
 * TeacherJourneyPanel
 * ===================
 * Educator class-aggregate Journey (docs/JOURNEY_VIEW.md). Shows ONLY
 * published modules/items — it's the student lens. Each assignment cell is
 * colored by the mastery state of the class-average effective score among
 * submitted attempts; the tooltip carries `n/N submitted · k sealed · avg`.
 * Assignment cells open the assignment; full-test cells open the per-test
 * overview (which owns the live cohort stats).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { SkeletonRows } from "@/components/Skeleton";
import { courseAssignmentPath, testOverviewPath } from "@/lib/routes";
import type { CourseModule } from "@/teacher/useCourseModules";
import {
  buildJourney,
  type JourneyAssignmentInfo,
  type JourneyCell,
} from "./buildJourney";
import { JourneyGrid, JourneyLegend } from "./JourneyGrid";
import { SEAL_THRESHOLD } from "./mastery";

interface TeacherJourneyPanelProps {
  courseId: string;
  modules: CourseModule[];
}

interface BestAttemptRow {
  assignment_id: string;
  effective_score: number | string | null;
  submitted_at: string | null;
}

export function TeacherJourneyPanel({
  courseId,
  modules,
}: TeacherJourneyPanelProps): JSX.Element {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(0);
  const [info, setInfo] = useState<Map<string, JourneyAssignmentInfo>>(
    () => new Map(),
  );

  const assignmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of modules) {
      if (!m.published) continue;
      for (const it of m.items) {
        if (it.published && it.item_type === "assignment" && it.item_ref_id) {
          ids.add(it.item_ref_id);
        }
      }
    }
    return [...ids];
  }, [modules]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const [countRes, aRes, bRes] = await Promise.all([
        supabase
          .from("course_memberships")
          .select("student_id", { count: "exact", head: true })
          .eq("course_id", courseId),
        assignmentIds.length > 0
          ? supabase
              .from("assignments")
              .select("id, kind, due_at")
              .in("id", assignmentIds)
          : Promise.resolve({ data: [], error: null }),
        assignmentIds.length > 0
          ? supabase
              .from("assignment_best_attempts")
              .select("assignment_id, effective_score, submitted_at")
              .in("assignment_id", assignmentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!alive) return;

      const total = countRes.count ?? 0;
      setEnrolled(total);

      // Per-assignment aggregate from best attempts (one row per student).
      const agg = new Map<
        string,
        { submitted: number; sealed: number; sum: number; scored: number }
      >();
      if (!bRes.error) {
        for (const r of (bRes.data ?? []) as BestAttemptRow[]) {
          if (r.submitted_at === null) continue;
          const cur = agg.get(r.assignment_id) ?? {
            submitted: 0,
            sealed: 0,
            sum: 0,
            scored: 0,
          };
          cur.submitted += 1;
          const score =
            r.effective_score === null ? null : Number(r.effective_score);
          if (score !== null && Number.isFinite(score)) {
            cur.sum += score;
            cur.scored += 1;
            if (score >= SEAL_THRESHOLD) cur.sealed += 1;
          }
          agg.set(r.assignment_id, cur);
        }
      }

      const map = new Map<string, JourneyAssignmentInfo>();
      if (!aRes.error) {
        for (const a of (aRes.data ?? []) as Array<{
          id: string;
          kind: string;
          due_at: string | null;
        }>) {
          const x = agg.get(a.id);
          map.set(a.id, {
            kind: a.kind,
            dueAt: a.due_at,
            score: x && x.scored > 0 ? x.sum / x.scored : null,
            submitted: (x?.submitted ?? 0) > 0,
            aggregate: {
              submitted: x?.submitted ?? 0,
              total,
              sealed: x?.sealed ?? 0,
            },
          });
        }
      }
      if (!alive) return;
      setInfo(map);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [courseId, assignmentIds]);

  const journey = useMemo(
    () =>
      buildJourney(
        modules.map((m) => ({
          id: m.id,
          name: m.name,
          published: m.published,
          opens_at: m.opens_at,
          items: m.items,
        })),
        { assignment: (refId) => info.get(refId) },
      ),
    [modules, info],
  );

  const openCell = (cell: JourneyCell): void => {
    if (cell.refId) {
      navigate(courseAssignmentPath(courseId, cell.refId));
      return;
    }
    if (cell.kind === "fulltest" && cell.testSlug) {
      navigate(testOverviewPath(cell.testSlug));
      return;
    }
    if (cell.url) window.open(cell.url, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return <SkeletonRows count={3} rowClassName="h-20" />;
  }

  if (journey.units.length === 0) {
    return (
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-8 text-center space-y-1">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Nothing published yet
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The journey shows what students see — publish a module to light it
          up.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <JourneyLegend />
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Class view · cells show the class average across{" "}
          <span className="tabular-nums font-medium">{enrolled}</span>{" "}
          {enrolled === 1 ? "student" : "students"} · hover a cell for detail
        </p>
      </div>
      <JourneyGrid units={journey.units} onOpenCell={openCell} aggregate />
    </div>
  );
}
