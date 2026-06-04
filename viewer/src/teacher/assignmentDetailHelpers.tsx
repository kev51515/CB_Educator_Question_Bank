/**
 * assignmentDetailHelpers
 * =======================
 * Source/difficulty labels, kind/source/difficulty type guards, date/time
 * formatters, pill tones + the <HeaderPill> leaf, and error helper for
 * AssignmentDetailPage. Extracted verbatim.
 */
import {
  type AssignmentSourceId,
  type AssignmentDifficultyMix,
} from "@/teacher/useAssignments";
export const SOURCE_LABELS: Record<AssignmentSourceId, string> = {
  cb: "CB Question Bank",
  sat: "SAT Factory",
  mixed: "Mixed",
};

export const DIFFICULTY_LABELS: Record<AssignmentDifficultyMix, string> = {
  any: "Any difficulty",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/**
 * Migration 0045 added a `kind` discriminator to `assignments`. A row is
 * either a SAT mock test (kind='mocktest', source_id set) or a static
 * Question-Bank set (kind='qbank_set', qbank_set_uid set, source_id NULL).
 * Legacy rows default to 'mocktest'. The detail view branches on this to
 * surface the right "test data" for a Practice Test module item.
 */
export type AssignmentKind = "mocktest" | "qbank_set";

export function isAssignmentKind(value: string | null | undefined): value is AssignmentKind {
  return value === "mocktest" || value === "qbank_set";
}
export function isSourceId(value: string): value is AssignmentSourceId {
  return value === "cb" || value === "sat" || value === "mixed";
}

export function isDifficultyMix(value: string): value is AssignmentDifficultyMix {
  return (
    value === "easy" ||
    value === "medium" ||
    value === "hard" ||
    value === "any"
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatTimeLimit(minutes: number): string {
  if (minutes <= 0) return "Untimed";
  return `${minutes} min`;
}

/**
 * Compact relative-time formatter for the sticky-header "Due" pill.
 * Returns labels like "Due in 3 days", "Due tomorrow", "Past due" so a
 * teacher scrolling the attempt list still sees the urgency at a glance.
 * Tooltip on the pill still shows the absolute timestamp.
 */
export function formatRelativeDue(iso: string | null): {
  label: string;
  tone: "rose" | "amber" | "slate";
} | null {
  if (!iso) return null;
  const now = Date.now();
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - now;
  const diffMin = Math.round(diffMs / 60_000);
  const diffHr = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);

  if (diffMs < 0) {
    return { label: "Past due", tone: "rose" };
  }
  if (diffMin < 60) {
    return {
      label: diffMin <= 1 ? "Due now" : `Due in ${diffMin} min`,
      tone: "rose",
    };
  }
  if (diffHr < 24) {
    return {
      label: `Due in ${diffHr} hr${diffHr === 1 ? "" : "s"}`,
      tone: "amber",
    };
  }
  if (diffDay === 1) {
    return { label: "Due tomorrow", tone: "amber" };
  }
  if (diffDay < 7) {
    return { label: `Due in ${diffDay} days`, tone: "amber" };
  }
  return { label: `Due in ${diffDay} days`, tone: "slate" };
}

export const PILL_TONES: Record<
  "emerald" | "indigo" | "violet" | "amber" | "rose" | "slate",
  string
> = {
  emerald:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  indigo:
    "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900",
  violet:
    "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900",
  amber:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  rose: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  slate:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

export interface HeaderPillProps {
  tone: keyof typeof PILL_TONES;
  label: string;
  title?: string;
}

export function HeaderPill({ tone, label, title }: HeaderPillProps) {
  return (
    <span
      title={title}
      aria-label={title ?? label}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${PILL_TONES[tone]}`}
    >
      {label}
    </span>
  );
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}
