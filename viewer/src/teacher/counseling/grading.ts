/**
 * grading — shared client contract for counseling star-grading (migration 0140)
 * =============================================================================
 * One source of truth for the grading-settings shape, the baked-in defaults
 * (matching counseling_effective_grading_settings in SQL), and the small
 * task-lifecycle helpers the student card, counselor panel, and settings panel
 * all need. Keeping these here stops the three surfaces from drifting.
 */
import { supabase } from "@/lib/supabase";

export interface GradingSettings {
  course_id: string;
  enabled: boolean;
  max_stars: number;
  on_time_stars: number;
  late_stars: number;
  quality_max_stars: number;
  allow_resubmission: boolean;
  max_resubmissions: number;
}

/** Defaults mirror counseling_effective_grading_settings() in 0140 — used when
 *  a course has no settings row yet so the UI reads the same scheme the RPCs do. */
export const DEFAULT_GRADING_SETTINGS: Omit<GradingSettings, "course_id"> = {
  enabled: true,
  max_stars: 5,
  on_time_stars: 3,
  late_stars: 1,
  quality_max_stars: 2,
  allow_resubmission: true,
  max_resubmissions: 2,
};

/** Fetch a course's grading settings, falling back to the defaults (so callers
 *  never have to special-case "no row yet"). */
export async function fetchGradingSettings(
  courseId: string,
): Promise<GradingSettings> {
  const { data } = await supabase
    .from("counseling_grading_settings")
    .select("*")
    .eq("course_id", courseId)
    .maybeSingle();
  return data
    ? (data as GradingSettings)
    : { course_id: courseId, ...DEFAULT_GRADING_SETTINGS };
}

/** The grading-relevant columns on a counseling_tasks row (0140). */
export interface GradableTask {
  id: string;
  gradable: boolean;
  due_date: string | null;
  status: "open" | "done";
  submitted_at: string | null;
  submission_on_time: boolean | null;
  punctuality_stars: number | null;
  quality_stars: number | null;
  stars: number | null;
  feedback: string | null;
  graded_at: string | null;
  resubmission_count: number;
}

export type GradeState = "not_submitted" | "awaiting_grade" | "graded";

/** Derive the lifecycle state from the row's columns (status stays open|done). */
export function gradeState(t: Pick<GradableTask, "submitted_at" | "graded_at">): GradeState {
  if (t.graded_at) return "graded";
  if (t.submitted_at) return "awaiting_grade";
  return "not_submitted";
}

/** Whether a (graded or awaiting) task may still be resubmitted under settings. */
export function canResubmit(
  t: Pick<GradableTask, "resubmission_count">,
  s: Pick<GradingSettings, "allow_resubmission" | "max_resubmissions">,
): boolean {
  return s.allow_resubmission && t.resubmission_count < s.max_resubmissions;
}
