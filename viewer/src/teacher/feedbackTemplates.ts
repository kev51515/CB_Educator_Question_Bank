/**
 * feedbackTemplates
 * =================
 * localStorage-backed library of reusable feedback strings for bulk grading.
 *
 * Daniel/Maya write the same "watch the negative-sign error in #4 — your
 * slope-intercept work is on point" feedback over and over. This module lets
 * them save those strings once and pick them from a chip row inside
 * BulkGradeModal.
 *
 * Storage:
 *  - One JSON array per teacher, keyed `feedback-templates:${teacherId}`.
 *  - Hard cap at MAX_TEMPLATES per teacher; when adding the (cap+1)th, the
 *    oldest by lastUsedAt is silently dropped.
 *  - Synchronous read/write. Parse errors return []. Quota errors throw so
 *    callers can show a toast.
 *
 * Not persisted server-side this pass — see roadmap if/when we move to a
 * shared library across the two teachers.
 */
const MAX_TEMPLATES = 25;
const LABEL_MAX = 60;

export interface FeedbackTemplate {
  id: string;
  label: string;
  body: string;
  createdAt: string;
  lastUsedAt: string;
}

function storageKey(teacherId: string): string {
  return `feedback-templates:${teacherId}`;
}

function readRaw(teacherId: string): FeedbackTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(teacherId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Light shape filter — drop anything that doesn't look like a template.
    return parsed.filter((t): t is FeedbackTemplate => {
      if (!t || typeof t !== "object") return false;
      const obj = t as Record<string, unknown>;
      return (
        typeof obj.id === "string" &&
        typeof obj.label === "string" &&
        typeof obj.body === "string" &&
        typeof obj.createdAt === "string" &&
        typeof obj.lastUsedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeRaw(teacherId: string, templates: FeedbackTemplate[]): void {
  if (typeof window === "undefined") return;
  // Let quota errors propagate so the caller can toast.
  window.localStorage.setItem(storageKey(teacherId), JSON.stringify(templates));
}

/**
 * Returns templates sorted by lastUsedAt DESC (most-recent first).
 */
export function listTemplates(teacherId: string): FeedbackTemplate[] {
  if (!teacherId) return [];
  const all = readRaw(teacherId);
  return [...all].sort((a, b) => {
    if (a.lastUsedAt === b.lastUsedAt) return 0;
    return a.lastUsedAt > b.lastUsedAt ? -1 : 1;
  });
}

export function saveTemplate(
  teacherId: string,
  t: Pick<FeedbackTemplate, "label" | "body">,
): FeedbackTemplate {
  if (!teacherId) {
    throw new Error("teacherId required to save template");
  }
  const label = t.label.trim().slice(0, LABEL_MAX);
  const body = t.body;
  if (label.length === 0) {
    throw new Error("Template name can't be empty");
  }
  if (body.trim().length === 0) {
    throw new Error("Template body can't be empty");
  }
  const now = new Date().toISOString();
  const tpl: FeedbackTemplate = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    label,
    body,
    createdAt: now,
    lastUsedAt: now,
  };
  const existing = readRaw(teacherId);
  let next = [...existing, tpl];
  // Cap: drop oldest-by-lastUsedAt until within budget.
  if (next.length > MAX_TEMPLATES) {
    next = [...next]
      .sort((a, b) => (a.lastUsedAt > b.lastUsedAt ? -1 : 1))
      .slice(0, MAX_TEMPLATES);
  }
  writeRaw(teacherId, next);
  return tpl;
}

export function deleteTemplate(teacherId: string, id: string): void {
  if (!teacherId) return;
  const existing = readRaw(teacherId);
  const next = existing.filter((t) => t.id !== id);
  if (next.length === existing.length) return;
  writeRaw(teacherId, next);
}

/**
 * Bumps lastUsedAt on the named template. No-op if the id isn't found —
 * teachers who delete a template mid-session shouldn't see a hard error.
 */
export function touchTemplate(teacherId: string, id: string): void {
  if (!teacherId || !id) return;
  const existing = readRaw(teacherId);
  let mutated = false;
  const next = existing.map((t) => {
    if (t.id !== id) return t;
    mutated = true;
    return { ...t, lastUsedAt: new Date().toISOString() };
  });
  if (!mutated) return;
  try {
    writeRaw(teacherId, next);
  } catch {
    // touchTemplate is best-effort — silently swallow quota errors here.
  }
}

export const __testing__ = { MAX_TEMPLATES, LABEL_MAX, storageKey };
