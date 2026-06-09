/**
 * Application entry point.
 *
 * Boot sequence:
 *   1. Mount React root inside #root
 *   2. Wrap App in an ErrorBoundary so a render crash doesn't blank the page
 *   3. Wrap in a <BrowserRouter> so AuthGate can route by URL (see
 *      docs/ARCHITECTURE.md §4e for the route map). All in-app navigation
 *      now goes through react-router-dom; no more hash- or state-based
 *      routing at the top level.
 *   4. Register the service worker for offline support
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary, ToastProvider } from "@/components";
import { BetaGate } from "@/beta/BetaGate";
import { AuthGate } from "@/auth";
import { registerServiceWorker } from "./registerSW";
import { captureError, initTelemetry } from "@/lib/telemetry";

// Global safety net for async failures. The ErrorBoundary only catches errors
// thrown during React render; awaited promise rejections (the bulk of this
// app's failures — RPC calls, fetches) escape it entirely. Forward both
// unhandled rejections and uncaught errors to Sentry so they stop being a
// monitoring blind spot. Registered before paint so nothing slips through the
// gap before telemetry boots (captureError queues until the SDK loads).
window.addEventListener("unhandledrejection", (event) => {
  captureError(event.reason, { source: "unhandledrejection" });
});
window.addEventListener("error", (event) => {
  captureError(event.error ?? event.message, { source: "window.onerror" });
});

// Defer telemetry init so the Sentry/PostHog SDK chunks load AFTER first paint
// instead of competing with app hydration. captureError/trackEvent calls made
// before the SDKs finish loading are queued + flushed (see telemetry.ts).
const bootTelemetry = (): void => {
  void initTelemetry();
};
const ric = window.requestIdleCallback;
if (typeof ric === "function") {
  ric(bootTelemetry, { timeout: 3000 });
} else {
  window.setTimeout(bootTelemetry, 1500);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BetaGate>
        <BrowserRouter>
          <ToastProvider>
            <AuthGate>
              <App />
            </AuthGate>
          </ToastProvider>
        </BrowserRouter>
      </BetaGate>
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
