/**
 * course-discussions/helpers
 * ==========================
 * Pure helpers for the course discussions list: error message, per-user
 * visited-topic localStorage map, relative-time, reply-count label, and the
 * UnreadState type. Extracted verbatim from CourseDiscussions. No JSX.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

// --- Unread-since-last-visit (localStorage, per-user) ---------------------
//
// We persist a `{ topicId → ISO timestamp }` map keyed by user id, written on
// DiscussionTopicView mount and read here on each render. The map is LRU-
// capped at 200 entries (most-recent wins) to bound storage growth even if
// a user opens hundreds of topics across many courses.
//
// Trade-off: we have no cheap way to filter "posts by other authors" without
// a DB change, so an OP who replies to their own topic will briefly see their
// own reply marked "new" until they revisit the topic page. Accepted.
// Writes to this map (with LRU cap = 200) happen in DiscussionTopicView; the
// list surface is read-only.
export const VISITED_KEY_PREFIX = "discussion.visited:";

export function loadVisitedMap(userId: string): Record<string, string> {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(`${VISITED_KEY_PREFIX}${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
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

export function replyLabel(count: number | undefined): string {
  if (count === undefined) return "";
  if (count === 0) return "No replies yet";
  if (count === 1) return "1 reply";
  return `${count} replies`;
}

/**
 * Unread state per row:
 *  - "visited-new": user has visited this topic before, but new activity has
 *    landed since then. Indigo pip (•) + "New replies" text.
 *  - "never": user has never visited this topic on this device. Slate "Unread"
 *    pill — distinguishes "first-time visit" from "delta since last visit".
 *  - "none": the user is current.
 *
 * On a brand-new device with empty localStorage every topic resolves to
 * "never" until visited — graceful degradation, no false silence.
 */
export type UnreadState = "visited-new" | "never" | "none";
