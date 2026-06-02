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
  item_type: "assignment" | "header" | "link" | "page" | "file";
  item_ref_id: string | null;
  title: string;
  url: string | null;
  indent: number;
  published: boolean;
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
