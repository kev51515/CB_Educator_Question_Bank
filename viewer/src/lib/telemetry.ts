/**
 * Telemetry singleton: Sentry (errors) + PostHog (product analytics).
 *
 * Both providers init only when their respective env vars are present.
 * In dev without keys, all functions become no-ops (errors are still
 * logged to console). This keeps the dev experience clean and the
 * production-ready code path harmless.
 *
 * Env vars (all optional):
 *   VITE_SENTRY_DSN   — Sentry DSN. Omitted → Sentry stays dormant.
 *   VITE_POSTHOG_KEY  — PostHog project API key. Omitted → PostHog stays dormant.
 *   VITE_POSTHOG_HOST — PostHog ingestion host. Defaults to US cloud.
 */
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

let sentryInitialized = false;
let posthogInitialized = false;

export function initTelemetry(): void {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  const posthogHost = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (sentryDsn && !sentryInitialized) {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
    });
    sentryInitialized = true;
  }

  if (posthogKey && !posthogInitialized) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: "identified_only",
    });
    posthogInitialized = true;
  }
}

export function identifyUser(userId: string, email: string, role: string): void {
  if (sentryInitialized) {
    Sentry.setUser({ id: userId, email, role });
  }
  if (posthogInitialized) {
    posthog.identify(userId, { email, role });
  }
}

export function clearUser(): void {
  if (sentryInitialized) {
    Sentry.setUser(null);
  }
  if (posthogInitialized) {
    posthog.reset();
  }
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (sentryInitialized) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
  // Log to console in dev so we still see something when Sentry is dormant.
  if (import.meta.env.DEV) {
    console.error("[telemetry]", error, context);
  }
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (posthogInitialized) {
    posthog.capture(name, properties);
  }
}
