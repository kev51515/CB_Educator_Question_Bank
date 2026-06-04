/**
 * topicFormHelpers
 * ================
 * Pure constants, draft-shape type, field error/touched types, localStorage
 * draft logic, validators, and small formatters for TopicFormModal. No JSX.
 */
export const MAX_TITLE_LEN = 200;
export const MAX_BODY_LEN = 10000;

/** Draft persistence constants. */
export const DRAFT_KEY_PREFIX = "teacher.topicForm.draft:";
export const DRAFT_DEBOUNCE_MS = 500;
export const DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Persisted draft shape. Only used in create mode. */
export interface TopicDraft {
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  savedAt: number;
}

/** Per-field error map. `null` means the field is currently valid. */
export type FieldKey = "title" | "body";
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

export function readDraft(courseId: string): TopicDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getDraftKey(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TopicDraft;
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

export function writeDraft(courseId: string, draft: TopicDraft): void {
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
  if (value.length > MAX_TITLE_LEN) {
    return `Title must be ${MAX_TITLE_LEN} characters or fewer.`;
  }
  return null;
}

export function validateBody(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Message is required.";
  if (value.length > MAX_BODY_LEN) {
    return `Message must be ${MAX_BODY_LEN} characters or fewer.`;
  }
  return null;
}

