/**
 * mockTestHistoryHelpers
 * ======================
 * Pure types + helpers extracted from MockTestHistoryPage. No behavior change.
 */

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface TestAttemptRow {
  id: string;
  set_uid: string | null;
  started_at: string;
  submitted_at: string | null;
  seconds_taken: number | null;
  score: number | null;
  total: number | null;
  source: string | null;
}

export interface MockAttempt {
  id: string;
  setUid: string;
  startedAt: string;
  submittedAt: string;
  durationSeconds: number;
  score: number;
  total: number;
  scorePercent: number;
  /** Coarse source label derived from set_uid prefix. */
  sourceLabel: "CB" | "SAT" | "Mixed";
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

export function deriveSourceLabel(setUid: string): MockAttempt["sourceLabel"] {
  const head = setUid.toLowerCase();
  if (head.startsWith("cb")) return "CB";
  if (head.startsWith("sat")) return "SAT";
  return "Mixed";
}

export function toAttempt(row: TestAttemptRow): MockAttempt | null {
  if (!row.submitted_at) return null;
  const total = row.total ?? 0;
  const score = row.score ?? 0;
  const scorePercent =
    total > 0 ? Math.round((score / total) * 100) : 0;
  return {
    id: row.id,
    setUid: row.set_uid ?? "",
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    durationSeconds: row.seconds_taken ?? 0,
    score,
    total,
    scorePercent,
    sourceLabel: deriveSourceLabel(row.set_uid ?? ""),
  };
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function scoreTone(pct: number): {
  text: string;
  bg: string;
  ring: string;
} {
  if (pct >= 80) {
    return {
      text: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      ring: "ring-emerald-200 dark:ring-emerald-900",
    };
  }
  if (pct >= 60) {
    return {
      text: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      ring: "ring-amber-200 dark:ring-amber-900",
    };
  }
  return {
    text: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    ring: "ring-rose-200 dark:ring-rose-900",
  };
}
