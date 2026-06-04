/**
 * portfolio-form/helpers
 * ======================
 * Pure constants, localStorage autosave-draft logic, value-payload shape, and
 * input helpers (filename sanitize, URL detect/normalize, validators) for the
 * student portfolio submission form. Extracted verbatim. No React/JSX.
 */
import type { StudentPortfolioItem } from "@/student/useStudentPortfolio";
export const STORAGE_BUCKET = "portfolio-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

// ---- Autosave constants -------------------------------------------------
export const AUTOSAVE_DEBOUNCE_MS = 1000;
export const AUTOSAVE_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const draftKey = (itemId: string, userId: string): string =>
  `student.portfolio.draft:${itemId}:${userId}`;

/** Shape of the locally-persisted draft. File uploads are NOT persisted
 *  (browsers can't reconstruct File objects from storage), only the
 *  textual / structural fields a student would lose on accidental close. */
export interface LocalDraft {
  savedAt: string; // ISO timestamp
  textValue: string;
  urlValue: string;
  numberValue: string;
  dateValue: string;
  choiceValue: string;
  multiValue: string[];
}

export function readDraft(key: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const d = parsed as Partial<LocalDraft>;
    if (typeof d.savedAt !== "string") return null;
    return {
      savedAt: d.savedAt,
      textValue: typeof d.textValue === "string" ? d.textValue : "",
      urlValue: typeof d.urlValue === "string" ? d.urlValue : "",
      numberValue: typeof d.numberValue === "string" ? d.numberValue : "",
      dateValue: typeof d.dateValue === "string" ? d.dateValue : "",
      choiceValue: typeof d.choiceValue === "string" ? d.choiceValue : "",
      multiValue: Array.isArray(d.multiValue)
        ? d.multiValue.filter((v): v is string => typeof v === "string")
        : [],
    };
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: LocalDraft): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** True when the draft has any user-entered content worth persisting. */
export function draftHasContent(draft: LocalDraft): boolean {
  return (
    draft.textValue.trim().length > 0 ||
    draft.urlValue.trim().length > 0 ||
    draft.numberValue.trim().length > 0 ||
    draft.dateValue.trim().length > 0 ||
    draft.choiceValue.length > 0 ||
    draft.multiValue.length > 0
  );
}

/** Format ISO timestamp as "just now" / "5 minutes ago" / etc. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "just now";
  const diffMs = then - now;
  const absSec = Math.round(Math.abs(diffMs) / 1000);
  if (absSec < 5) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const sign = diffMs < 0 ? -1 : 1;
  if (absSec < 60) return rtf.format(sign * absSec, "second");
  const absMin = Math.round(absSec / 60);
  if (absMin < 60) return rtf.format(sign * absMin, "minute");
  const absHr = Math.round(absMin / 60);
  if (absHr < 24) return rtf.format(sign * absHr, "hour");
  const absDay = Math.round(absHr / 24);
  return rtf.format(sign * absDay, "day");
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 180) || "file";
}

export function looksLikeUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return /^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(trimmed);
  }
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Extract optional numeric bounds from the loose `settings` object. */
export function settingsNumber(
  settings: unknown,
  key: "min" | "max",
): number | null {
  if (!settings || typeof settings !== "object") return null;
  const v = (settings as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Required is canonically on item.required; allow a settings.required override too. */
export function isRequired(item: StudentPortfolioItem): boolean {
  if (item.required) return true;
  if (item.settings && typeof item.settings === "object") {
    const v = (item.settings as Record<string, unknown>).required;
    if (typeof v === "boolean") return v;
  }
  return false;
}

export interface ValuePayload {
  value_text: string | null;
  value_url: string | null;
  value_file_path: string | null;
  value_file_size: number | null;
  value_file_mime: string | null;
  value_number: number | null;
  value_date: string | null;
  value_choice: string | null;
  value_multi_choice: string[] | null;
}

export function emptyValuePayload(): ValuePayload {
  return {
    value_text: null,
    value_url: null,
    value_file_path: null,
    value_file_size: null,
    value_file_mime: null,
    value_number: null,
    value_date: null,
    value_choice: null,
    value_multi_choice: null,
  };
}

