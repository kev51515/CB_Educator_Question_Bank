/**
 * assignment-form/helpers
 * =======================
 * Pure constants, data-shape types, localStorage draft logic, and field
 * validators for AssignmentFormModal. No React/JSX — extracted verbatim so the
 * modal file holds just the component. All top-level decls are exported.
 */
import type {
  AssignmentDifficultyMix,
  AssignmentSourceId,
} from "@/teacher/useAssignments";
export interface SourceOption {
  value: AssignmentSourceId;
  label: string;
  hint: string;
}

export interface DifficultyOption {
  value: AssignmentDifficultyMix;
  label: string;
}

export const SOURCE_OPTIONS: SourceOption[] = [
  { value: "cb", label: "CB Question Bank", hint: "Official CB items" },
  { value: "sat", label: "SAT Factory", hint: "Practice SAT items" },
  { value: "mixed", label: "Mixed", hint: "Both pools" },
];

export const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  { value: "any", label: "Any" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export const MIN_QUESTION_COUNT = 5;
export const MAX_QUESTION_COUNT = 50;
export const DEFAULT_QUESTION_COUNT = 22;
export const DEFAULT_TIME_LIMIT_MINUTES = 30;
export const DEFAULT_LATE_PENALTY_PERCENT = 0;
export const DEFAULT_GRACE_PERIOD_HOURS = 0;
export const MAX_TITLE_LENGTH = 200;

/** Draft persistence constants. */
export const DRAFT_KEY_PREFIX = "teacher.assignmentForm.draft:";
export const DRAFT_DEBOUNCE_MS = 500;
export const DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Shape of the multi-attempt / late-policy columns added in migration 0020.
    We fetch these directly inside the modal so we don't have to widen the
    shared Assignment type (and the rest of the app) before they're rolled out
    end-to-end. */
export interface AssignmentPolicyRow {
  max_attempts: number | null;
  late_penalty_percent: number | null;
  grace_period_hours: number | null;
}

/** Persisted draft shape. Only used in create mode. */
export interface AssignmentDraft {
  title: string;
  description: string;
  sourceId: AssignmentSourceId;
  questionCount: number;
  timeLimit: number;
  difficultyMix: AssignmentDifficultyMix;
  dueAt: string | null;
  maxAttempts: string;
  latePenaltyPercent: number;
  gracePeriodHours: number;
  savedAt: number;
}

/** Per-field error map. `null` means the field is currently valid. */
export type FieldKey =
  | "title"
  | "questionCount"
  | "timeLimit"
  | "maxAttempts"
  | "latePenaltyPercent"
  | "gracePeriodHours";

export type FieldErrors = Partial<Record<FieldKey, string | null>>;
export type TouchedFields = Partial<Record<FieldKey, boolean>>;

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/** Lightweight relative time formatter — "just now" / "5m ago" / "3h ago" /
 *  "2d ago". Used for the draft restore banner. */
export function formatRelativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function getDraftKey(courseId: string): string {
  return `${DRAFT_KEY_PREFIX}${courseId}`;
}

export function readDraft(courseId: string): AssignmentDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getDraftKey(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssignmentDraft;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.savedAt > DRAFT_STALE_MS) {
      // Stale — wipe and treat as absent.
      window.localStorage.removeItem(getDraftKey(courseId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(courseId: string, draft: AssignmentDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getDraftKey(courseId), JSON.stringify(draft));
  } catch {
    // Quota errors etc. — swallow; draft is a non-essential nicety.
  }
}

export function clearDraft(courseId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getDraftKey(courseId));
  } catch {
    // ignore
  }
}

/** Pure validators per field. Returns an error string or null. */
export function validateTitle(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Title is required.";
  if (value.length > MAX_TITLE_LENGTH) {
    return `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }
  return null;
}

export function validateQuestionCount(value: number): string | null {
  if (!Number.isFinite(value)) return "Question count is required.";
  if (!Number.isInteger(value)) return "Question count must be a whole number.";
  if (value < MIN_QUESTION_COUNT || value > MAX_QUESTION_COUNT) {
    return `Question count must be between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}.`;
  }
  return null;
}

export function validateTimeLimit(value: number): string | null {
  if (!Number.isFinite(value)) return "Time limit is required.";
  if (value < 0) return "Time limit must be 0 or greater.";
  if (value > 300) return "Time limit must be 300 minutes or fewer.";
  return null;
}

export function validateMaxAttempts(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null; // blank = unlimited
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return "Max attempts must be a number.";
  if (parsed < 1) return "Max attempts must be 1 or higher.";
  if (parsed > 20) return "Max attempts must be 20 or fewer.";
  return null;
}

export function validateLatePenalty(value: number): string | null {
  if (!Number.isFinite(value)) return "Late penalty is required.";
  if (value < 0 || value > 100) return "Late penalty must be between 0 and 100.";
  return null;
}

export function validateGraceHours(value: number): string | null {
  if (!Number.isFinite(value)) return "Grace period is required.";
  if (value < 0) return "Grace period must be 0 or greater.";
  if (value > 168) return "Grace period must be 168 hours (7 days) or fewer.";
  return null;
}

