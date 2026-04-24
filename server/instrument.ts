// Sentry initialization. Imported first in server/index.ts so it runs
// before any other module loads. If SENTRY_DSN isn't set, init() is a
// no-op and captureException becomes a silent function — safe in dev.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    // No automatic performance traces by default — turn on when needed.
    // Setting tracesSampleRate to 0 disables transactions but keeps error capture.
    tracesSampleRate: 0,
    // Don't send default PII; we attach our own context (user.id only) via
    // Sentry.setUser inside the auth middleware.
    sendDefaultPii: false,
    // Surface uncaught exceptions and unhandled rejections too.
    integrations: (defaults) => defaults,
  });
}

export { Sentry };
