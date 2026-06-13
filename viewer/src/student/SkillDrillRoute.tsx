/**
 * SkillDrillRoute
 * ===============
 * Route page for a "skill_drill" module item (`/student/skill-drill/:itemId`).
 * A Skill Drill is a practice set auto-targeted at the student's WEAK skills —
 * it REUSES the qbank_set runner + grading wholesale. The only new logic is
 * selection: `useSkillDrillSet` resolves the student's weakest matching catalog
 * set, then we mount `QBankAssignmentRunner` with a SYNTHESIZED assignment that
 * carries the resolved set's `qbank_set_uid` + label.
 *
 * Flow:
 *   1. Fetch the module_item by id for its `config.section` filter + title.
 *   2. Resolve the weak-skill → catalog set via `useSkillDrillSet(section)`.
 *   3. Call `ensure_skill_drill_assignment` (migration 0238) to create/return a
 *      REAL hidden per-student `qbank_set` assignment for the resolved uid, then
 *      mount QBankAssignmentRunner against a QBankAssignment whose `id` is that
 *      real assignment id (so `submit_qbank_attempt` persists + the mastery loop
 *      closes). The runner resolves the questions file from the uid and the
 *      static test-runner grades the set in-iframe.
 *
 * The assignment is HIDDEN (assignments.hidden = true), so it never appears in
 * any list, count, gradebook, or calendar — see the `.eq("hidden", false)`
 * filters across the client.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components";
import { ROUTES } from "@/lib/routes";
import { computeDefaultQbankTimeLimit } from "@/teacher/modules-page/persistence";
import { useSkillDrillSet } from "./useSkillDrillSet";
import { QBankAssignmentRunner, type QBankAssignment } from "./QBankAssignmentRunner";

interface ModuleItemConfigRow {
  id: string;
  title: string;
  config: { section?: string } | null;
  course_modules: { course_id: string } | { course_id: string }[] | null;
}

function readSection(config: { section?: string } | null): string | undefined {
  const s = config?.section;
  return s === "math" || s === "reading-and-writing" ? s : undefined;
}

function readCourseId(
  rel: ModuleItemConfigRow["course_modules"],
): string {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.course_id ?? "";
  return rel.course_id ?? "";
}

export function SkillDrillRoute() {
  const params = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const itemId = params.itemId ?? "";

  const [item, setItem] = useState<ModuleItemConfigRow | null>(null);
  const [itemLoading, setItemLoading] = useState(true);
  const [itemError, setItemError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!itemId) {
      setItemError("Missing item ID.");
      setItemLoading(false);
      return;
    }
    setItemLoading(true);
    setItemError(null);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("module_items")
          .select("id, title, config, course_modules!inner(course_id)")
          .eq("id", itemId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setItemError(error.message);
        } else if (!data) {
          setItemError("Skill drill not found.");
        } else {
          setItem(data as unknown as ModuleItemConfigRow);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setItemError(err instanceof Error ? err.message : "Failed to load.");
        }
      } finally {
        if (!cancelled) setItemLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const section = readSection(item?.config ?? null);
  const drill = useSkillDrillSet(section);

  // Real assignment id from `ensure_skill_drill_assignment` (a hidden per-student
  // qbank_set assignment). Resolved once the drill set is known.
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [aidLoading, setAidLoading] = useState(false);
  const [aidError, setAidError] = useState<string | null>(null);

  const drillResolved = !drill.loading && !drill.empty;
  const drillUid = drillResolved ? drill.uid : null;
  const drillLabel = drillResolved ? drill.label : null;
  const drillCount = drillResolved ? drill.entry.questionCount : null;

  useEffect(() => {
    let cancelled = false;
    if (!itemId || !drillUid || !drillLabel) {
      setAssignmentId(null);
      return;
    }
    setAidLoading(true);
    setAidError(null);
    void (async () => {
      try {
        const count = drillCount ?? 10;
        const { data, error } = await supabase.rpc(
          "ensure_skill_drill_assignment",
          {
            p_item_id: itemId,
            p_qbank_set_uid: drillUid,
            p_label: drillLabel,
            p_question_count: count,
            p_time_limit: computeDefaultQbankTimeLimit(count),
          },
        );
        if (cancelled) return;
        if (error) {
          setAidError(error.message);
        } else if (!data) {
          setAidError("Could not start this drill.");
        } else {
          setAssignmentId(data as string);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setAidError(err instanceof Error ? err.message : "Failed to start drill.");
        }
      } finally {
        if (!cancelled) setAidLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, drillUid, drillLabel, drillCount]);

  const goHome = (): void => {
    void navigate(ROUTES.HOME);
  };

  // Build the assignment the runner needs, using the REAL assignment id returned
  // by `ensure_skill_drill_assignment`. The runner reads id (for submit), kind,
  // qbank_set_uid, qbank_set_label, and title.
  const assignment = useMemo<QBankAssignment | null>(() => {
    if (!drillResolved || !assignmentId) return null;
    const courseId = readCourseId(item?.course_modules ?? null);
    const count = drill.entry.questionCount;
    return {
      id: assignmentId,
      course_id: courseId,
      class_name: "",
      title: drill.label,
      description: null,
      source_id: "cb",
      question_count: count,
      time_limit_minutes: computeDefaultQbankTimeLimit(count),
      difficulty_mix: "any",
      due_at: null,
      opens_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      my_attempt: null,
      results_pending: false,
      kind: "qbank_set",
      qbank_set_uid: drill.uid,
      qbank_set_label: drill.label,
    };
  }, [drillResolved, assignmentId, drill, item]);

  if (itemLoading || drill.loading || aidLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-10">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <Skeleton className="h-7 w-56 rounded-lg" />
          <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-3">
            <Skeleton className="h-5 w-full rounded" />
            <Skeleton className="h-5 w-3/4 rounded" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (itemError) {
    return <SkillDrillMessage title="Couldn't open this drill" body={itemError} onBack={goHome} />;
  }

  if (aidError) {
    return <SkillDrillMessage title="Couldn't open this drill" body={aidError} onBack={goHome} />;
  }

  // No weak-skill set matched yet — friendly nudge, not an error.
  if (drill.empty || !assignment) {
    return (
      <SkillDrillMessage
        title="No weak-skill drill available yet"
        body="Take a practice test first so we can spot the skills to drill. Once you have some results, this Skill Drill will target your weakest areas automatically."
        onBack={goHome}
      />
    );
  }

  return <QBankAssignmentRunner assignment={assignment} onExit={goHome} />;
}

function SkillDrillMessage({
  title,
  body,
  onBack,
}: {
  title: string;
  body: string;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{body}</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
        >
          Back
        </button>
      </div>
    </div>
  );
}
