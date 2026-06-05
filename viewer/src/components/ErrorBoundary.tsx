/**
 * ErrorBoundary
 * =============
 * Top-level error boundary so a bad component or thrown render error doesn't
 * blank the whole app. Mount this at the root (in `main.tsx`) and let it wrap
 * `<App />`.
 *
 * Recovery: shows the error message + a "Reload" button. The "Open issue"
 * link nudges users to file feedback rather than silently giving up.
 *
 * Stale-chunk recovery: when a new build is deployed, hashed lazy-chunk
 * filenames change and any still-loaded `index.html` (HTTP cache, an old open
 * tab, or a stale service-worker shell) points at chunks the server no longer
 * has. The lazy import then throws "Failed to fetch dynamically imported
 * module", which surfaces here. A plain reset just re-requests the same dead
 * URL, and a plain reload can re-serve the same stale shell — so we detect this
 * class of error specifically, purge the service worker + Cache Storage, and do
 * a ONE-TIME hard reload (guarded via sessionStorage so a genuinely broken
 * deploy can't trap the user in a reload loop).
 *
 * Devtools: when running under Vite (dev), the original stack is dumped to
 * `console.error` so the dev experience matches the error-overlay behavior
 * developers expect.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureError } from "@/lib/telemetry";

/** sessionStorage key holding the timestamp of our last forced chunk-reload. */
const CHUNK_RELOAD_KEY = "app:chunk-reloaded-at";
/** Don't auto-reload again within this window — a still-failing import after a
 *  fresh reload means the deploy itself is broken, not just our cache. */
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

/**
 * True when `error` is a lazy/dynamic-import (code-split chunk) load failure.
 * Browsers word this differently, so match all the known variants.
 */
function isChunkLoadError(error: Error): boolean {
  if (error?.name === "ChunkLoadError") return true;
  const msg = (error?.message || String(error) || "").toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    // Wrong-MIME variant: server returned index.html (text/html) for a
    // missing .js chunk, so the browser refuses to execute it.
    msg.includes("is not a valid javascript mime type")
  );
}

/** Purge the service worker + all Cache Storage, then hard-reload once. */
async function purgeCachesAndReload(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* best-effort — keep going to the reload regardless */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best-effort */
  }
  location.reload();
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback override. Receives the error message and a reset callback. */
  fallback?: (message: string, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Set when the caught error is a stale-chunk load failure (see above). */
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, isChunkError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, isChunkError: isChunkLoadError(error) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Report to Sentry (no-op when DSN missing). captureError also logs to
    // console in dev, so we don't double-log here.
    captureError(error, { errorInfo: info });

    // Stale-chunk failure → a fresh build is live but this tab is running the
    // old shell. Auto-recover by purging caches + hard-reloading ONCE. The
    // cooldown guard means a genuinely broken deploy shows the manual fallback
    // instead of thrashing in a reload loop.
    if (isChunkLoadError(error)) {
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      if (!Number.isFinite(last) || Date.now() - last > CHUNK_RELOAD_COOLDOWN_MS) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        void purgeCachesAndReload();
      }
    }
  }

  private reset = (): void => {
    this.setState({ error: null, isChunkError: false });
  };

  private hardReload = (): void => {
    void purgeCachesAndReload();
  };

  override render(): ReactNode {
    const { error, isChunkError } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error.message || String(error), this.reset);
    }

    // Stale-chunk screen: friendly, no stack trace. componentDidCatch has
    // usually already kicked off the auto-reload; this is what the user sees
    // for the moment before navigation, or the manual path if the cooldown
    // guard suppressed an auto-reload (broken deploy).
    if (isChunkError) {
      return (
        <div className="h-full flex items-center justify-center p-8 text-center bg-white">
          <div className="max-w-md">
            <div
              className="mx-auto w-12 h-12 rounded-2xl bg-accent-50 border border-accent-100 flex items-center justify-center"
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-accent-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </div>
            <h1 className="mt-5 text-[15px] font-semibold text-ink-800">
              Updating to the latest version…
            </h1>
            <p className="mt-1 text-[12.5px] text-ink-500">
              A new version was just released. We&rsquo;re refreshing to load it.
            </p>
            <div className="mt-5 flex items-center justify-center">
              <button
                type="button"
                onClick={this.hardReload}
                className="px-3 py-1.5 text-[12px] rounded-md bg-accent-600 hover:bg-accent-700 text-white transition-colors focus-ring"
              >
                Reload now
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex items-center justify-center p-8 text-center bg-white">
        <div className="max-w-md">
          <div
            className="mx-auto w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center"
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-red-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="mt-5 text-[15px] font-semibold text-ink-800">Something went wrong</h1>
          <p className="mt-1 text-[12.5px] text-ink-500 break-all">{error.message || String(error)}</p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="px-3 py-1.5 text-[12px] rounded-md bg-ink-100 hover:bg-ink-200 text-ink-800 transition-colors focus-ring"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.hardReload}
              className="px-3 py-1.5 text-[12px] rounded-md bg-accent-600 hover:bg-accent-700 text-white transition-colors focus-ring"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
