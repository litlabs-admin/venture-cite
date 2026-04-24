import * as Sentry from "@sentry/react";

// Initialize Sentry on the client. No-op if VITE_SENTRY_DSN isn't set, so
// dev environments without a DSN keep working silently.
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ??
      (import.meta.env.MODE as string | undefined) ??
      "development",
    // No automatic tracing — flip this on once we want spans.
    tracesSampleRate: 0,
    // Don't replay sessions by default (PII risk + cost).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Don't send default PII; we set Sentry user explicitly in use-auth.
    sendDefaultPii: false,
  });
}

export { Sentry };
