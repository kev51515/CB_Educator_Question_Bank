/**
 * notifications/preferences
 * =========================
 * localStorage-backed notification preferences. Lets a user opt OUT of
 * specific notification kinds — the unread badge + dropdown filter the
 * dropped kinds out at the hook level.
 *
 * Storage shape:
 *   `${STORAGE_KEY}:${userId}` → JSON `{ optedOut: string[] }`
 *
 * Default state is "all kinds enabled". A missing key is treated the same
 * as an empty `optedOut` array. Per-user scoping means switching accounts
 * on a shared machine doesn't leak preferences across users.
 */

const STORAGE_KEY = "notifications.optOut";

/**
 * Public catalog of notification kinds the user can toggle. The `id` matches
 * the `kind` column on the `notifications` table (migrations 0029, 0058,
 * 0059). Adding a new kind here exposes it in the UI; the hook treats any
 * kind not listed here as "always shown" so old clients don't accidentally
 * suppress a brand-new kind.
 */
export const NOTIFICATION_KINDS = [
  {
    id: "announcement",
    label: "Announcements",
    description: "Course-wide posts from your teachers.",
  },
  {
    id: "message",
    label: "Direct messages",
    description: "1:1 inbox messages from teachers or classmates.",
  },
  {
    id: "feedback",
    label: "Feedback",
    description: "Comments and grading notes on your assignment attempts.",
  },
  {
    id: "assignment_grade",
    label: "Assignment grades",
    description: "Heads-up when an attempt has been graded.",
  },
  {
    id: "reminder",
    label: "Reminders",
    description: "Upcoming due dates and other scheduled prompts.",
  },
] as const;

export type NotificationKindId = (typeof NOTIFICATION_KINDS)[number]["id"];

export interface NotificationPrefs {
  optedOut: ReadonlySet<string>;
}

const EMPTY_PREFS: NotificationPrefs = { optedOut: new Set<string>() };

/**
 * Per-user localStorage key. We namespace by `userId` so prefs don't bleed
 * across accounts on a shared machine. Anonymous/no-user callers get the
 * unscoped base key as a best-effort fallback.
 */
export function prefsStorageKey(userId: string | null): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

/**
 * Load preferences from localStorage. Returns the default ("all enabled")
 * on any read or parse error so a corrupted blob never breaks the bell.
 */
export function loadPrefs(userId: string | null): NotificationPrefs {
  if (typeof window === "undefined") return EMPTY_PREFS;
  try {
    const raw = window.localStorage.getItem(prefsStorageKey(userId));
    if (!raw) return EMPTY_PREFS;
    const parsed = JSON.parse(raw) as { optedOut?: unknown };
    const list = Array.isArray(parsed.optedOut)
      ? parsed.optedOut.filter((value): value is string => typeof value === "string")
      : [];
    return { optedOut: new Set<string>(list) };
  } catch {
    return EMPTY_PREFS;
  }
}

/**
 * Persist preferences for a specific user. No-op when there is no user
 * (we never want to write the unscoped key from a real save).
 */
export function savePrefs(userId: string, prefs: NotificationPrefs): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ optedOut: Array.from(prefs.optedOut) });
    window.localStorage.setItem(prefsStorageKey(userId), payload);
  } catch {
    // Quota or privacy-mode failures — silently ignore. The UI still
    // reflects the in-memory state for this session.
  }
}

/**
 * Returns true when the user wants to see notifications of this kind.
 * Unknown kinds default to enabled — see comment on NOTIFICATION_KINDS.
 */
export function isKindEnabled(prefs: NotificationPrefs, kind: string): boolean {
  return !prefs.optedOut.has(kind);
}

/**
 * Immutable helper — returns a new prefs object with the kind toggled.
 */
export function togglePref(
  prefs: NotificationPrefs,
  kind: string,
  enabled: boolean,
): NotificationPrefs {
  const next = new Set(prefs.optedOut);
  if (enabled) {
    next.delete(kind);
  } else {
    next.add(kind);
  }
  return { optedOut: next };
}

/**
 * Reset — all kinds re-enabled.
 */
export function resetPrefs(): NotificationPrefs {
  return EMPTY_PREFS;
}
