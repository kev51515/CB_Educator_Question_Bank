/**
 * test-overview/helpers
 * =====================
 * Row/live-info types and pure formatters (integrity summary, error message,
 * time/percent/minutes) for the teacher test-overview page. Extracted verbatim
 * from TestOverviewPage. No JSX.
 */
export interface TestRow {
  id: string;
  slug: string;
  title: string;
  short_title: string | null;
  total_questions: number | null;
}
export interface ModuleRow {
  position: number;
  section: "reading-writing" | "math";
  label: string;
  time_limit_seconds: number;
  question_count: number;
}
export interface RosterRow {
  student_id: string;
  student_name: string | null;
  run_id: string | null;
  score: number | null;
  total: number | null;
  submitted_at: string | null;
  results_released_at: string | null;
  has_in_progress: boolean;
}
/** Live snapshot per student (test_live_progress) merged into the roster. */
export interface LiveInfo {
  state: "in_progress" | "submitted" | "not_started";
  module_position: number | null;
  module_label: string | null;
  current_question: number | null;
  answered: number | null;
  module_questions: number | null;
  away_count: number | null;
  paused: boolean | null;
  integrity: Record<string, number> | null;
  started_at: string | null;
  submitted_at: string | null;
  run_id: string | null;
}

/** "paste 2 · left FS 1" from the integrity counter bag, or null if clean. */
export function fmtIntegrity(i: Record<string, number> | null | undefined): string | null {
  if (!i) return null;
  const labels: Array<[string, string]> = [
    ["paste", "paste"],
    ["copy", "copy"],
    ["fullscreen_exit", "left FS"],
  ];
  const parts = labels
    .filter(([k]) => (i[k] ?? 0) > 0)
    .map(([k, label]) => `${label} ${i[k]}×`);
  return parts.length ? parts.join(" · ") : null;
}

// --- helpers ---------------------------------------------------------------

export function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}
export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}
export function pctOf(score: number | null, total: number | null): number | null {
  if (score == null || total == null || total <= 0) return null;
  return Math.round((score / total) * 100);
}
export function fmtMins(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

