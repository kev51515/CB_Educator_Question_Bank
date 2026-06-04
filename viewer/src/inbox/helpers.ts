/**
 * inbox/helpers
 * =============
 * Per-user localStorage persistence for muted/pinned thread IDs, the UUID
 * regex, and the timestamp formatter for the inbox list. Pure — extracted
 * verbatim from InboxPage.
 */
// Per-user localStorage key for muted thread IDs.
export const mutedThreadsKey = (userId: string): string =>
  `inbox.mutedThreads:${userId}`;

// Per-user localStorage key for pinned thread IDs.
export const pinnedThreadsKey = (userId: string): string =>
  `inbox.pinnedThreads:${userId}`;

// LRU cap — generous; users rarely mute / pin that many threads. When
// exceeded, we drop the oldest entries (front of the array).
export const MUTED_THREADS_CAP = 500;
export const PINNED_THREADS_CAP = 500;

/**
 * Read the muted-thread set from localStorage. Returns a plain Set for O(1)
 * lookup. Shape-validates (must be an array of strings); any quota / JSON /
 * shape error is swallowed and treated as "no muted threads".
 */
export function readMutedThreads(userId: string | null): Set<string> {
  if (!userId) return new Set();
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(mutedThreadsKey(userId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const ids: string[] = [];
    for (const v of parsed) {
      if (typeof v === "string") ids.push(v);
    }
    return new Set(ids);
  } catch {
    return new Set();
  }
}

/**
 * Persist the muted-thread set. Enforces the LRU cap by keeping the most
 * recent entries (set insertion order is preserved). Swallows quota errors.
 */
export function writeMutedThreads(userId: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    let arr = Array.from(ids);
    if (arr.length > MUTED_THREADS_CAP) {
      arr = arr.slice(arr.length - MUTED_THREADS_CAP);
    }
    window.localStorage.setItem(mutedThreadsKey(userId), JSON.stringify(arr));
  } catch {
    // Quota exceeded or storage unavailable — silently drop. Muting is
    // best-effort UX state, not a contract we're failing.
  }
}

/**
 * Read the pinned-thread set from localStorage. Mirrors readMutedThreads:
 * shape-validates and swallows JSON / quota errors.
 */
export function readPinnedThreads(userId: string | null): Set<string> {
  if (!userId) return new Set();
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(pinnedThreadsKey(userId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const ids: string[] = [];
    for (const v of parsed) {
      if (typeof v === "string") ids.push(v);
    }
    return new Set(ids);
  } catch {
    return new Set();
  }
}

/**
 * Persist the pinned-thread set. LRU cap matches the mute pattern. Swallows
 * quota / storage errors — pinning is best-effort UX state.
 */
export function writePinnedThreads(userId: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    let arr = Array.from(ids);
    if (arr.length > PINNED_THREADS_CAP) {
      arr = arr.slice(arr.length - PINNED_THREADS_CAP);
    }
    window.localStorage.setItem(pinnedThreadsKey(userId), JSON.stringify(arr));
  } catch {
    // Quota exceeded or storage unavailable — silently drop.
  }
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString();
}
