/**
 * teacherAttemptGradingHelpers
 * ============================
 * Pure helpers extracted from TeacherAttemptDetailView. Constants for the
 * feedback editor plus the legacy localStorage key builders / readers from the
 * Wave 20A MVP buffer. These are drained on mount and then deleted; kept here
 * so the drain logic in the view reads cleanly.
 */

export const FEEDBACK_DEBOUNCE_MS = 1500;
export const FEEDBACK_MAX_LEN = 10000;

// Legacy localStorage keys from the Wave 20A MVP buffer. We drain these on
// mount, then delete them. Kept as helpers so the drain logic reads cleanly.
export function feedbackLegacyKey(attemptId: string): string {
  return `grading.${attemptId}.feedback`;
}
export function scoreLegacyKey(attemptId: string): string {
  return `grading.${attemptId}.score_override`;
}
export function gradedAtLegacyKey(attemptId: string): string {
  return `grading.${attemptId}.graded_at`;
}

export function readLegacy(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function clearLegacy(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
