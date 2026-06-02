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
 * Devtools: when running under Vite (dev), the original stack is dumped to
 * `console.error` so the dev experience matches the error-overlay behavior
 * developers expect.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureError } from "@/lib/telemetry";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback override. Receives the error message and a reset callback. */
  fallback?: (message: string, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Report to Sentry (no-op when DSN missing). captureError also logs to
    // console in dev, so we don't double-log here.
    captureError(error, { errorInfo: info });
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error.message || String(error), this.reset);
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
              onClick={() => location.reload()}
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
