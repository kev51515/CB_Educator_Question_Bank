/**
 * qbank_set_uid — the single source of truth for question-set identity.
 * ====================================================================
 *
 * A question-bank set ("Question Set" in UI vocabulary) is identified across
 * the whole app by a `qbank_set_uid` string. That string is:
 *
 *   - COMPUTED from a catalog entry on the teacher side when a set is assigned
 *     to a course/module, and stored in `assignments.qbank_set_uid`.
 *   - RESOLVED back to a catalog entry on the student side when the runner
 *     needs to find the questions HTML to load.
 *
 * Both sides MUST use the exact same encoding or the runner can't find the
 * file. This used to live as two separate copies — one in
 * `teacher/useQuestionBankCatalog.ts` (joined with `::`) and one in
 * `student/QBankAssignmentRunner.tsx` (joined with `-`). They silently drifted
 * apart and EVERY question-set assignment failed to load. This module exists
 * so there is exactly one encoder. Do not re-implement it elsewhere.
 *
 * Canonical form (example):
 *   skill::reading-and-writing::medium::command-of-evidence::2
 *
 * The `setId` (e.g. "1", "2") is only unique within
 * (axis, section, difficulty, topic), so the full tuple is encoded.
 */

/** The minimal identity fields every catalog entry carries. */
export interface QbankSetIdentity {
  axis: string;
  section: string;
  difficulty: string;
  topic: string;
  setId: string;
}

/**
 * Canonical encoder. Lowercases each part and collapses internal whitespace to
 * `-`, then joins with `::`. This is the value written to
 * `assignments.qbank_set_uid` — keep it stable.
 */
export function qbankSetUid(entry: QbankSetIdentity): string {
  return [entry.axis, entry.section, entry.difficulty, entry.topic, entry.setId]
    .map((part) => part.toString().toLowerCase().replace(/\s+/g, "-"))
    .join("::");
}

/**
 * Pre-fix `-`-joined encoding (topic slugified separately). Retained ONLY so a
 * resolver can fall back to it for any row that might have been written before
 * the encoders were unified. New code should never produce this form.
 */
export function legacyQbankSetUid(entry: QbankSetIdentity): string {
  const topicSlug = entry.topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${entry.axis}-${entry.section}-${entry.difficulty}-${topicSlug}-${entry.setId}`;
}

/**
 * True when `storedUid` identifies `entry`, tolerant of both the canonical and
 * legacy encodings. Case-insensitive.
 */
export function qbankSetUidMatches(
  entry: QbankSetIdentity,
  storedUid: string,
): boolean {
  const lower = storedUid.toLowerCase();
  return qbankSetUid(entry) === lower || legacyQbankSetUid(entry) === lower;
}
