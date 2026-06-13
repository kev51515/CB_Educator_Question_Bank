/**
 * studentCourseHelpers
 * ====================
 * Pure helpers, constants, and row/stat types extracted from
 * StudentCourseView. No React, no side effects — mechanical extraction only.
 */

export interface CourseRow {
  id: string;
  short_code: string;
  name: string;
  description: string | null;
  /** 'class' | 'counseling' (0133). Drives the student counseling section. */
  course_type?: string | null;
  /** Supabase types embedded relations as arrays even on FK joins that
   *  resolve to at most one row. Normalised to a single nullable record
   *  at usage time. */
  teacher?: { display_name: string | null }[] | { display_name: string | null } | null;
}

export function teacherName(row: CourseRow): string | null {
  const t = row.teacher;
  if (!t) return null;
  if (Array.isArray(t)) {
    return t[0]?.display_name ?? null;
  }
  return t.display_name ?? null;
}

/**
 * Quick-stats summary for the student landing header. Three independent
 * signals are computed in parallel; each falls back to "—" on failure so a
 * single broken stat doesn't blank the row. Mirrors the teacher's
 * CourseOverview pattern (`useCourseOverview`) — stats only, no recent
 * activity list.
 */
export interface CourseStats {
  // Count of assignments in this course not yet submitted by me with a
  // future due_at. `null` while loading or if the query failed.
  assignmentsDue: number | null;
  // Average effective_score across my submitted attempts in this course
  // (last 30 days). `null` if I have no submitted attempts or the view
  // is unavailable.
  myAverage: number | null;
  // Count of submitted attempts with non-null effective_score that fed
  // the average. Used to decide whether to render "—" or the number.
  myAverageSampleSize: number;
}

export interface AssignmentDueRow {
  id: string;
  due_at: string | null;
  assignment_attempts: { submitted_at: string | null }[] | null;
}

export interface EffectiveAttemptRow {
  effective_score: number | string | null;
  submitted_at: string | null;
}

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface ModuleItemRow {
  id: string;
  position: number;
  item_type:
    | "assignment"
    | "header"
    | "link"
    | "page"
    | "file"
    | "note"
    | "divider"
    | "video"
    | "goal"
    | "countdown"
    | "live_session"
    | "survey"
    | "vocab";
  item_ref_id: string | null;
  title: string;
  url: string | null;
  indent: number;
  published: boolean;
  /** Per-type inline payload (0225) — note body+tone, etc. */
  config?: Record<string, unknown> | null;
}

export interface ModuleRow {
  id: string;
  name: string;
  position: number;
  published: boolean;
  opens_at: string | null;
  module_items: ModuleItemRow[];
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load course.";
}

export function isLocked(opens_at: string | null): boolean {
  if (!opens_at) return false;
  return new Date(opens_at).getTime() > Date.now();
}

/**
 * Per-assignment metadata fetched for assignment-type module items so the
 * student row can show a kind badge, due date, and their own completion.
 */
export interface AssignmentMeta {
  kind: string; // 'mocktest' | 'qbank_set'
  due_at: string | null;
  shortCode: string | null;
  questionCount: number | null;
  timeLimitMinutes: number | null;
  /** Best effective_score (0–100) across my attempts, or null. */
  bestScore: number | null;
  /** True once I have a submitted attempt. */
  submitted: boolean;
  /** id of that best attempt — powers the journey popover's Review link. */
  bestAttemptId?: string | null;
}

/** UI label for an assignment kind (vocabulary canon — see CLAUDE.md). */
export function kindLabel(kind: string | null | undefined): string {
  if (kind === "mocktest") return "Practice Test";
  if (kind === "qbank_set") return "Question Set";
  return "Assignment";
}

export type DueTone = "past" | "soon" | "normal";

/** Relative due-date label + urgency tone, or null when there's no due date. */
export function formatDue(iso: string | null): { text: string; tone: DueTone } | null {
  if (!iso) return null;
  const due = new Date(iso).getTime();
  if (!Number.isFinite(due)) return null;
  const diff = due - Date.now();
  const DAY = 86_400_000;
  if (diff < 0) {
    const d = Math.round(-diff / DAY);
    return { text: d <= 0 ? "Past due" : `Past due ${d}d`, tone: "past" };
  }
  if (diff < 60 * 60 * 1000) return { text: "Due within the hour", tone: "soon" };
  if (diff < DAY) return { text: "Due today", tone: "soon" };
  if (diff < 2 * DAY) return { text: "Due tomorrow", tone: "soon" };
  if (diff < 7 * DAY) return { text: `Due in ${Math.round(diff / DAY)}d`, tone: "normal" };
  return {
    text: `Due ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    tone: "normal",
  };
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
