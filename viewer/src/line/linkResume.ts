/**
 * LINE link-token resume
 * ======================
 * LINE opens the bot's "finish linking" URL in its in-app browser, which has
 * NO LMS session. AuthGate then redirects any non-/signin URL to sign-in with
 * `<Navigate replace>`, discarding the `?linkToken=…`. To survive that, we stash
 * the token synchronously at app load (before the router renders / redirects),
 * then AuthGate resumes to /line/link once the user is authenticated.
 */
const KEY = "line.pendingLinkToken";

/** Call once, synchronously, at app boot — before the router mounts. */
export function stashPendingLinkTokenFromUrl(): void {
  try {
    if (typeof window === "undefined") return;
    if (!window.location.pathname.includes("/line/link")) return;
    const t = new URLSearchParams(window.location.search).get("linkToken");
    if (t) window.localStorage.setItem(KEY, t);
  } catch {
    /* private mode / storage disabled — non-fatal */
  }
}

export function peekPendingLinkToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingLinkToken(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
