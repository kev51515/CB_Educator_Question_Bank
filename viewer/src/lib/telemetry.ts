/**
 * Telemetry singleton: Sentry (errors) + PostHog (product analytics).
 *
 * Both providers init only when their respective env vars are present.
 * In dev without keys, all functions become no-ops (errors are still
 * logged to console). This keeps the dev experience clean and the
 * production-ready code path harmless.
 *
 * Performance: the Sentry and PostHog SDKs are **dynamically imported** so they
 * land in their own async chunks instead of the main bundle (~110 KB gzip
 * combined). `initTelemetry()` is fire-and-forget and is scheduled AFTER first
 * paint by main.tsx. Any identity/events/errors that arrive before the SDKs
 * finish loading are queued and flushed on load, so deferral loses nothing.
 *
 * Env vars (all optional):
 *   VITE_SENTRY_DSN   — Sentry DSN. Omitted → Sentry stays dormant.
 *   VITE_POSTHOG_KEY  — PostHog project API key. Omitted → PostHog stays dormant.
 *   VITE_POSTHOG_HOST — PostHog ingestion host. Defaults to US cloud.
 */
import type * as SentryNS from "@sentry/react";
import type { PostHog } from "posthog-js";

// Build-time env constants — used to decide whether a provider WILL load (so we
// don't queue forever when its key is absent, matching the old no-op behavior).
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

let sentry: typeof SentryNS | null = null;
let posthog: PostHog | null = null;

// Pre-load buffers (bounded). Flushed when the matching SDK finishes loading.
let pendingUser: { userId: string; email: string; role: string } | null = null;
let userCleared = false;
const pendingEvents: Array<{ name: string; properties?: Record<string, unknown> }> = [];
const pendingErrors: Array<{ error: unknown; context?: Record<string, unknown> }> = [];
const QUEUE_CAP = 100;

export async function initTelemetry(): Promise<void> {
  const tasks: Array<Promise<void>> = [];

  if (SENTRY_DSN && !sentry) {
    tasks.push(
      import("@sentry/react").then((S) => {
        S.init({
          dsn: SENTRY_DSN,
          environment: import.meta.env.MODE,
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 1.0,
          integrations: [S.browserTracingIntegration(), S.replayIntegration()],
        });
        sentry = S;
        if (userCleared) S.setUser(null);
        else if (pendingUser)
          S.setUser({ id: pendingUser.userId, email: pendingUser.email, role: pendingUser.role });
        for (const { error, context } of pendingErrors) {
          S.captureException(error, context ? { extra: context } : undefined);
        }
        pendingErrors.length = 0;
      }),
    );
  }

  if (POSTHOG_KEY && !posthog) {
    tasks.push(
      import("posthog-js").then((m) => {
        const ph = m.default;
        ph.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          autocapture: true,
          capture_pageview: true,
          capture_pageleave: true,
          person_profiles: "identified_only",
        });
        posthog = ph;
        if (userCleared) ph.reset();
        else if (pendingUser)
          ph.identify(pendingUser.userId, {
            email: pendingUser.email,
            role: pendingUser.role,
          });
        for (const { name, properties } of pendingEvents) ph.capture(name, properties);
        pendingEvents.length = 0;
      }),
    );
  }

  await Promise.all(tasks);
}

export function identifyUser(userId: string, email: string, role: string): void {
  pendingUser = { userId, email, role };
  userCleared = false;
  sentry?.setUser({ id: userId, email, role });
  posthog?.identify(userId, { email, role });
}

export function clearUser(): void {
  pendingUser = null;
  userCleared = true;
  sentry?.setUser(null);
  posthog?.reset();
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (sentry) {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } else if (SENTRY_DSN && pendingErrors.length < QUEUE_CAP) {
    pendingErrors.push({ error, context });
  }
  // Log to console in dev so we still see something when Sentry is dormant.
  if (import.meta.env.DEV) {
    console.error("[telemetry]", error, context);
  }
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (posthog) {
    posthog.capture(name, properties);
  } else if (POSTHOG_KEY && pendingEvents.length < QUEUE_CAP) {
    pendingEvents.push({ name, properties });
  }
}
