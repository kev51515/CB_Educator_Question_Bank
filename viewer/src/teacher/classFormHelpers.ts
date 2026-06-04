/**
 * classFormHelpers
 * ================
 * Pure join-code generation (unambiguous alphabet), constants, draft-shape
 * type, localStorage draft logic, validators, and formatters for ClassFormModal.
 * No JSX.
 */
// Why this alphabet: visually unambiguous characters only. We drop the
// look-alikes O/0, I/1, and L. That keeps the human-readable codes robust
// over voice / handwritten contexts.
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const DRAFT_KEY = "teacher.classForm.draft";
export const DRAFT_DEBOUNCE_MS = 500;
export const DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type FieldKey = "name" | "description";

export interface ClassDraft {
  name: string;
  description: string;
  savedAt: number;
}

export function randomFromAlphabet(length: number): string {
  // crypto.getRandomValues for unbiased-ish sampling. We tolerate the slight
  // modulo bias because the alphabet size (31) is small relative to 256.
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = (buf[i] ?? 0) % ALPHABET.length;
    out += ALPHABET[idx];
  }
  return out;
}

export function generateJoinCode(): string {
  // Format: 4 chars - 4 chars, e.g. ABCD-2345
  return `${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;
}

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

export function readDraft(): ClassDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClassDraft;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.savedAt > DRAFT_STALE_MS) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(draft: ClassDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Quota / private-mode — swallow; draft is a non-essential nicety.
  }
}

export function clearStoredDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/** Pure validators per field. Returns an error string or null. */
export function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Course name is required.";
  if (value.length > MAX_NAME_LENGTH) {
    return `Course name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

export function validateDescription(value: string): string | null {
  if (value.length > MAX_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }
  return null;
}
