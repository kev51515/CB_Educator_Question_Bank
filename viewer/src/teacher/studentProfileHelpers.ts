/**
 * studentProfileHelpers
 * =====================
 * Pure helpers, constants, and types extracted from StudentProfilePage.
 * Move-only: logic is identical to the originals.
 */
import type { StudentAttemptRow } from "./useStudentProfile";

// --- Small utilities -------------------------------------------------------

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  if (abs < 60_000) return "just now";
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 3_600_000) return fmt.format(minutes, "minute");
    if (abs < 86_400_000) return fmt.format(hours, "hour");
    if (abs < 30 * 86_400_000) return fmt.format(days, "day");
    return then.toLocaleDateString();
  } catch {
    return then.toLocaleString();
  }
}

export function formatScore(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

export function getInitials(displayName: string | null, email: string): string {
  const source = displayName?.trim() || email.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

export function previewBody(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max)}…`;
}

export function attemptStatusLabel(row: StudentAttemptRow): {
  label: string;
  toneClass: string;
} {
  if (row.submitted_at === null) {
    return {
      label: "In progress",
      toneClass:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    };
  }
  if (row.status === "graded" || row.effective_score !== null) {
    return {
      label: "Graded",
      toneClass:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    };
  }
  return {
    label: "Submitted",
    toneClass:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  };
}

// --- Score trajectory sparkline --------------------------------------------
//
// Tiny inline SVG sparkline showing the student's effective-score trajectory
// across their most recent (up to 15) graded attempts. Lives in the profile
// header, just under the role chip. Pure SVG, no chart library, no new deps.
//
// Scale: y is 0..100 (effective_score is already a percent). The last
// segment is colored by score band (emerald ≥80 / indigo 70-79 /
// amber 50-69 / rose <50) so the eye snaps to the trend's destination.

export interface TrajectoryPoint {
  /** Index in the sorted-ascending series (used as the x coordinate). */
  x: number;
  /** Effective score 0..100. */
  y: number;
  /** Submitted-at ISO date for the hover <title>. */
  date: string;
}

export const SPARK_W = 280;
export const SPARK_H = 60;
export const SPARK_PAD_X = 6;
export const SPARK_PAD_Y = 8;

export function bandClass(score: number): string {
  if (score >= 80) return "text-emerald-500 dark:text-emerald-400";
  if (score >= 70) return "text-indigo-500 dark:text-indigo-400";
  if (score >= 50) return "text-amber-500 dark:text-amber-400";
  return "text-rose-500 dark:text-rose-400";
}

export function bandFillClass(score: number): string {
  if (score >= 80) return "fill-emerald-600 dark:fill-emerald-400";
  if (score >= 70) return "fill-indigo-600 dark:fill-indigo-400";
  if (score >= 50) return "fill-amber-600 dark:fill-amber-400";
  return "fill-rose-600 dark:fill-rose-400";
}

export function projectSparkX(index: number, total: number): number {
  if (total <= 1) return SPARK_W / 2;
  const range = SPARK_W - SPARK_PAD_X * 2;
  return SPARK_PAD_X + (index / (total - 1)) * range;
}

export function projectSparkY(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  const range = SPARK_H - SPARK_PAD_Y * 2;
  // y inverted: high score → small y
  return SPARK_PAD_Y + (1 - clamped / 100) * range;
}

export function formatSparkDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
