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
import { useToast } from "@/components/Toast";
import { useProfile } from "@/lib/profile";
import {
  courseAssignmentAttemptPath,
  courseAssignmentPath,
  testOverviewPath,
} from "@/lib/routes";
import type { CourseModule } from "@/teacher/useCourseModules";
import {
  buildJourney,
  type JourneyAssignmentInfo,
  type JourneyCell,
} from "./buildJourney";
import { JourneyGrid, JourneyLegend } from "./JourneyGrid";
import {
  TeacherCellTriage,
  type TriageDetail,
  type TriageStudent,
} from "./TeacherCellTriage";
import {
  TeacherClassHeatmap,
  type HeatmapColumn,
  type HeatmapEntry,
  type HeatmapStudent,
} from "./TeacherClassHeatmap";
import { PROFICIENT_THRESHOLD, SEAL_THRESHOLD } from "./mastery";

interface TeacherJourneyPanelProps {
  courseId: string;
  modules: CourseModule[];
}

interface BestAttemptRow {
  assignment_id: string;
  student_id: string;
  attempt_id: string | null;
  effective_score: number | string | null;
  submitted_at: string | null;
}

/** Cap the popover's needs-attention list — full triage lives in Gradebook. */
const NEEDS_ATTENTION_CAP = 4;

export function TeacherJourneyPanel({
  courseId,
  modules,
}: TeacherJourneyPanelProps): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(0);
  const [info, setInfo] = useState<Map<string, JourneyAssignmentInfo>>(
    () => new Map(),
  );
  const [triage, setTriage] = useState<Map<string, TriageDetail>>(
    () => new Map(),
  );
  // Per-student matrix for the D2 heatmap: refId -> studentId -> entry.
  const [matrixEntries, setMatrixEntries] = useState<
    Map<string, Map<string, HeatmapEntry>>
  >(() => new Map());
  const [roster, setRoster] = useState<HeatmapStudent[]>([]);
  // Class (aggregate grid) | Students (heatmap matrix) — persisted.
  const tabKey = `staff.journeyTab:${courseId}`;
  const [tab, setTab] = useState<"class" | "students">(() => {
    try {
      return window.localStorage.getItem(tabKey) === "students"
        ? "students"
        : "class";
    } catch {
      return "class";
    }
  });
  const pickTab = (next: "class" | "students"): void => {
    setTab(next);
    try {
      window.localStorage.setItem(tabKey, next);
    } catch {
      // ignore
    }
  };

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
      const [rosterRes, aRes, bRes] = await Promise.all([
        supabase
          .from("course_memberships")
          .select("student_id")
          .eq("course_id", courseId),
        assignmentIds.length > 0
          ? supabase
              .from("assignments")
              .select("id, kind, due_at")
              .eq("hidden", false)
              .in("id", assignmentIds)
          : Promise.resolve({ data: [], error: null }),
        assignmentIds.length > 0
          ? supabase
              .from("assignment_best_attempts")
              .select(
                "assignment_id, student_id, attempt_id, effective_score, submitted_at",
              )
              .in("assignment_id", assignmentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!alive) return;

      const studentIds = ((rosterRes.data ?? []) as Array<{ student_id: string }>)
        .map((r) => r.student_id);
      const total = studentIds.length;
      setEnrolled(total);

      // Names for the needs-attention list (separate query — no FK-name
      // coupling on the embedded join).
      const names = new Map<string, string>();
      if (studentIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", studentIds);
        if (!alive) return;
        for (const p of (profs ?? []) as Array<{
          id: string;
          display_name: string | null;
        }>) {
          names.set(p.id, p.display_name ?? "Student");
        }
      }

      // Per-assignment per-student best scores (one row per student).
      const byAssignment = new Map<
        string,
        Map<string, number | null> // student_id -> best score (null = unscored)
      >();
      const entryMap = new Map<string, Map<string, HeatmapEntry>>();
      if (!bRes.error) {
        for (const r of (bRes.data ?? []) as BestAttemptRow[]) {
          if (r.submitted_at === null) continue;
          const score =
            r.effective_score === null ? null : Number(r.effective_score);
          const normalized =
            score !== null && Number.isFinite(score) ? score : null;
          let m = byAssignment.get(r.assignment_id);
          if (!m) {
            m = new Map();
            byAssignment.set(r.assignment_id, m);
          }
          m.set(r.student_id, normalized);
          let em = entryMap.get(r.assignment_id);
          if (!em) {
            em = new Map();
            entryMap.set(r.assignment_id, em);
          }
          em.set(r.student_id, {
            score: normalized,
            attemptId: r.attempt_id,
          });
        }
      }

      const map = new Map<string, JourneyAssignmentInfo>();
      const triageMap = new Map<string, TriageDetail>();
      if (!aRes.error) {
        for (const a of (aRes.data ?? []) as Array<{
          id: string;
          kind: string;
          due_at: string | null;
        }>) {
          const scores = byAssignment.get(a.id) ?? new Map();
          let sealed = 0;
          let proficient = 0;
          let attempted = 0;
          let sum = 0;
          let scored = 0;
          const low: TriageStudent[] = [];
          for (const [sid, score] of scores) {
            if (score === null) {
              attempted += 1;
              continue;
            }
            sum += score;
            scored += 1;
            if (score >= SEAL_THRESHOLD) sealed += 1;
            else if (score >= PROFICIENT_THRESHOLD) proficient += 1;
            else {
              attempted += 1;
              low.push({ id: sid, name: names.get(sid) ?? "Student", score });
            }
          }
          const notStartedIds = studentIds.filter((sid) => !scores.has(sid));
          const needsAttention: TriageStudent[] = [
            ...low.sort((x, y) => (x.score ?? 0) - (y.score ?? 0)),
            ...notStartedIds.map((sid) => ({
              id: sid,
              name: names.get(sid) ?? "Student",
              score: null,
            })),
          ].slice(0, NEEDS_ATTENTION_CAP);

          map.set(a.id, {
            kind: a.kind,
            dueAt: a.due_at,
            score: scored > 0 ? sum / scored : null,
            submitted: scores.size > 0,
            aggregate: { submitted: scores.size, total, sealed },
          });
          triageMap.set(a.id, {
            sealed,
            proficient,
            attempted,
            notStarted: notStartedIds.length,
            submitted: scores.size,
            total,
            avg: scored > 0 ? sum / scored : null,
            needsAttention,
          });
        }
      }
      if (!alive) return;
      setInfo(map);
      setTriage(triageMap);
      setMatrixEntries(entryMap);
      setRoster(
        studentIds.map((sid) => ({
          id: sid,
          name: names.get(sid) ?? "Student",
        })),
      );
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

  // Nudge = one DM per needs-attention student via the existing inbox
  // primitives (open_thread_with + messages insert). Returns the sent count.
  const nudge = async (
    cell: JourneyCell,
    students: TriageStudent[],
  ): Promise<number> => {
    const authorId = profile?.id;
    if (!authorId) return 0;
    const body =
      `Reminder: "${cell.title}" is waiting for you` +
      (cell.dueAt
        ? ` — due ${new Date(cell.dueAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}.`
        : ".") +
      " You've got this!";
    let sent = 0;
    for (const s of students) {
      try {
        const { data: threadId, error: tErr } = await supabase.rpc(
          "open_thread_with",
          { p_other_user_id: s.id },
        );
        if (tErr || typeof threadId !== "string") continue;
        const { error: mErr } = await supabase
          .from("messages")
          .insert({ thread_id: threadId, author_id: authorId, body });
        if (!mErr) sent += 1;
      } catch {
        // skip this student, keep going
      }
    }
    if (sent > 0) {
      toast.success(
        "Nudge sent",
        `${sent} student${sent === 1 ? "" : "s"} DM'd about "${cell.title}".`,
      );
    } else {
      toast.error("Couldn't send nudges", "Try again from the Inbox.");
    }
    return sent;
  };

  // D2 heatmap columns = trackable assignment cells in journey order.
  const heatmapColumns: HeatmapColumn[] = useMemo(() => {
    const cols: HeatmapColumn[] = [];
    for (const u of journey.units) {
      for (const c of u.cells) {
        if (c.refId && (c.kind === "set" || c.kind === "test")) {
          cols.push({
            refId: c.refId,
            title: c.title,
            unitName: u.name,
            kind: c.kind === "test" ? "mocktest" : "qbank_set",
          });
        }
      }
    }
    return cols;
  }, [journey]);

  // Row-level nudge (heatmap): one general DM, not assignment-specific.
  const nudgeStudent = async (student: HeatmapStudent): Promise<void> => {
    const authorId = profile?.id;
    if (!authorId) return;
    try {
      const { data: threadId, error: tErr } = await supabase.rpc(
        "open_thread_with",
        { p_other_user_id: student.id },
      );
      if (tErr || typeof threadId !== "string") throw tErr ?? new Error("no thread");
      const { error: mErr } = await supabase.from("messages").insert({
        thread_id: threadId,
        author_id: authorId,
        body: "Reminder: you have unfinished checkpoints waiting in your course journey — jump back in! You've got this.",
      });
      if (mErr) throw mErr;
      toast.success("Nudge sent", `${student.name} got a DM.`);
    } catch {
      toast.error("Couldn't send the nudge", "Try again from the Inbox.");
    }
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
      <div className="flex flex-wrap items-center gap-3">
        {/* Class (aggregate grid) | Students (D2 heatmap) */}
        <div
          className="inline-flex items-center rounded-full bg-indigo-600/[0.08] dark:bg-indigo-400/10 p-0.5"
          role="tablist"
          aria-label="Journey lens"
        >
          {(
            [
              ["class", "Class grid"],
              ["students", "Students"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={tab === mode}
              onClick={() => pickTab(mode)}
              className={`min-h-[32px] rounded-full px-3.5 text-xs font-semibold motion-safe:transition-colors ${
                tab === mode
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <JourneyLegend />
        {tab === "class" && (
          <p className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">
            Cells show the class average across{" "}
            <span className="tabular-nums font-medium">{enrolled}</span>{" "}
            {enrolled === 1 ? "student" : "students"} · click a cell to triage
          </p>
        )}
      </div>

      {tab === "students" ? (
        <TeacherClassHeatmap
          columns={heatmapColumns}
          students={roster}
          entries={matrixEntries}
          triage={triage}
          onOpenAttempt={(refId, attemptId) =>
            navigate(courseAssignmentAttemptPath(courseId, refId, attemptId))
          }
          onNudgeStudent={(s) => {
            void nudgeStudent(s);
          }}
        />
      ) : (
        <JourneyGrid
          units={journey.units}
          onOpenCell={openCell}
          aggregate
          // Full tests have no per-student best-attempt data here — the
          // per-test overview owns that. Navigate directly instead.
          hasPopover={(cell) => !!cell.refId && triage.has(cell.refId)}
          popover={(cell, close) => {
            const detail = cell.refId ? triage.get(cell.refId) : undefined;
            if (!detail) return null;
            return (
              <TeacherCellTriage
                cell={cell}
                detail={detail}
                onOpenAssignment={() => {
                  close();
                  openCell(cell);
                }}
                onNudge={(students) => nudge(cell, students)}
              />
            );
          }}
        />
      )}
    </div>
  );
}
