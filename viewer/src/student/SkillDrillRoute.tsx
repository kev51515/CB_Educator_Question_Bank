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
 *   3. Mount QBankAssignmentRunner against a synthesized QBankAssignment whose
 *      `kind='qbank_set'`, `qbank_set_uid=<resolved uid>`, label="Skill Drill:
 *      {topic}". The runner resolves the questions file from the uid (catalog
 *      fallback path) and the static test-runner grades the set in-iframe.
 *
 * No new tables/RPCs. See the deviation note in the implementation report: the
 * synthesized assignment id is NOT a real `assignments` row, so server-side
 * `submit_qbank_attempt` persistence is a documented follow-up; the in-iframe
 * grading + review still works for the student today.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components";
import { ROUTES } from "@/lib/routes";
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

  const goHome = (): void => {
    void navigate(ROUTES.HOME);
  };

  // Synthesize the assignment the runner needs once we've resolved a set. The id
  // is the module_item id (a stable per-occurrence key); kind/qbank fields point
  // the runner at the resolved set. Non-grading fields are filled with safe
  // defaults — the runner only reads id, kind, qbank_set_uid, qbank_set_label,
  // and title.
  const synthesized = useMemo<QBankAssignment | null>(() => {
    if (drill.loading || drill.empty) return null;
    const courseId = readCourseId(item?.course_modules ?? null);
    return {
      id: itemId,
      course_id: courseId,
      class_name: "",
      title: drill.label,
      description: null,
      source_id: "cb",
      question_count: drill.entry.questionCount,
      time_limit_minutes: 0,
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
  }, [drill, item, itemId]);

  if (itemLoading || drill.loading) {
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

  // No weak-skill set matched yet — friendly nudge, not an error.
  if (drill.empty || !synthesized) {
    return (
      <SkillDrillMessage
        title="No weak-skill drill available yet"
        body="Take a practice test first so we can spot the skills to drill. Once you have some results, this Skill Drill will target your weakest areas automatically."
        onBack={goHome}
      />
    );
  }

  return <QBankAssignmentRunner assignment={synthesized} onExit={goHome} />;
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
