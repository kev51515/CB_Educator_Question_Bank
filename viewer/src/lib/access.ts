/**
 * access.ts — small, explicit feature allow-lists.
 *
 * Some authoring surfaces are owned by a specific subset of educators rather
 * than every staff member. Rather than scatter email checks across the nav,
 * routes, and command palette, we centralise the decision here so there's one
 * source of truth to edit when the team changes.
 *
 * NOTE (enforcement scope): these gates hide UI + guard client routes. They
 * are NOT a hard data lock — the underlying content tables stay readable by
 * the student runners and other staff via the API. For a trusted-staff
 * internal tool that's the right proportionality; if hard server-side
 * enforcement is ever needed, promote this to a `profiles` capability column
 * + RLS (and keep this helper reading from it).
 */

/**
 * Educators permitted to open the Question Bank authoring surface (the bank
 * itself + its global submission log). Stored lower-cased; compare via
 * {@link canAccessQuestionBank}, which normalises the input.
 */
const QUESTION_BANK_EMAILS: ReadonlySet<string> = new Set([
  "kyao@prepmastersedu.com",
  "kevyao@gmail.com",
]);

/**
 * True if `email` is on the Question Bank allow-list. Case-insensitive and
 * whitespace-tolerant; a null/empty email is never allowed.
 */
export function canAccessQuestionBank(email: string | null | undefined): boolean {
  if (!email) return false;
  return QUESTION_BANK_EMAILS.has(email.trim().toLowerCase());
}
