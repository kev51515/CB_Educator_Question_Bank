/**
 * course-announcements/helpers
 * ============================
 * Pure error-message + relative-time helpers for the announcements surface.
 * Extracted verbatim from CourseAnnouncements. No JSX.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/**
 * Pure presentation: render an ISO timestamp as "2 hours ago" / "yesterday"
 * style relative text. Falls back to the date string if Intl.RelativeTimeFormat
 * is missing (it's standard in every modern browser, but Defense in Depth).
 */
export function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);

  // Tiny windows — say "just now" rather than "in 0 seconds".
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
