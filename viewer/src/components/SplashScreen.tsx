/**
 * SplashScreen
 * ============
 * Friendly full-screen state used while the index is loading or after a
 * load error. Replaces the previous bare "Loading…" / red error text with:
 *
 *   - Brand mark + product name so the user knows the app booted
 *   - Animated loading indicator (subtle, accessible)
 *   - For errors: a clear title, the message, and a remediation hint
 *
 * Two variants, selected via the `mode` prop:
 *   - "loading" → shimmering dots while the initial fetch is in flight
 *   - "error"   → red title + error detail + the canonical fix command
 */
import type { ReactNode } from "react";

interface SplashScreenProps {
  mode: "loading" | "error";
  /** Error message, used when mode === "error". */
  message?: string | null;
  /** Optional hint shown beneath the error message. */
  hint?: ReactNode;
}

export function SplashScreen({ mode, message, hint }: SplashScreenProps) {
  return (
    <div
      className="h-full flex items-center justify-center p-8 text-center bg-white"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-md">
        <BrandMark />
        <h1 className="mt-5 text-[15px] font-semibold tracking-tight text-ink-800">
          OmniLMS
        </h1>

        {mode === "loading" ? (
          <>
            <p className="mt-1 text-[12.5px] text-ink-500">Loading question index…</p>
            <LoadingDots />
          </>
        ) : (
          <>
            <p className="mt-3 text-[13px] font-medium text-red-600">
              Couldn't load <span className="font-mono">data/index.json</span>
            </p>
            {message && (
              <p className="mt-1 text-[12.5px] text-ink-500 break-all">{message}</p>
            )}
            {hint && <div className="mt-3 text-[11.5px] text-ink-400">{hint}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/** Minimal monogram mark — pure CSS, no asset deps. */
function BrandMark() {
  return (
    <div
      className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-sm"
      aria-hidden
    >
      <span className="text-white text-[18px] font-bold tracking-tight">SAT</span>
    </div>
  );
}

/** Three-dot loading indicator with staggered animation. */
function LoadingDots() {
  return (
    <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
      <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse [animation-delay:300ms]" />
    </div>
  );
}
