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
  /** 0141: 'one_attempt' (default; teacher grants extra) | 'unlimited' (practice). */
  retake_policy: "one_attempt" | "unlimited";
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
  // Proctoring roll-up (migration 0108). Nullable for runs that predate it.
  away_total_seconds: number | null;
  focus_loss_count: number | null;
  focus_loss_seconds: number | null;
  flagged: boolean;
  flag_reasons: string[];
}

/**
 * Coerce a raw `test_live_progress` row into LiveInfo, defaulting the 0108
 * proctoring fields so older runs (and any RPC that hasn't been migrated)
 * degrade cleanly instead of surfacing `undefined`.
 */
export function toLiveInfo(raw: Record<string, unknown>): LiveInfo {
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    state: (raw.state as LiveInfo["state"]) ?? "not_started",
    module_position: num(raw.module_position),
    module_label: (raw.module_label as string | null) ?? null,
    current_question: num(raw.current_question),
    answered: num(raw.answered),
    module_questions: num(raw.module_questions),
    away_count: num(raw.away_count),
    paused: (raw.paused as boolean | null) ?? null,
    integrity: (raw.integrity as Record<string, number> | null) ?? null,
    started_at: (raw.started_at as string | null) ?? null,
    submitted_at: (raw.submitted_at as string | null) ?? null,
    run_id: (raw.run_id as string | null) ?? null,
    away_total_seconds: num(raw.away_total_seconds),
    focus_loss_count: num(raw.focus_loss_count),
    focus_loss_seconds: num(raw.focus_loss_seconds),
    flagged: Boolean(raw.flagged),
    flag_reasons: Array.isArray(raw.flag_reasons)
      ? (raw.flag_reasons as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
  };
}

/** Reason-code → human label for the integrity flag badges (migration 0108). */
export function flagLabel(code: string): string {
  switch (code) {
    case "away_60s":
      return "Left tab >1 min";
    case "away_3x":
      return "Left tab 3+ times";
    case "fs_exit":
      return "Exited full screen";
    case "paste":
      return "Pasted content";
    case "focus_3x":
      return "Lost focus 3+ times";
    default:
      return code;
  }
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
/** "0:42" / "3:05" from a second count — compact away-time for roster badges. */
export function fmtAwaySecs(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

