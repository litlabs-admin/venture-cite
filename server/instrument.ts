// Sentry initialization. Imported first in server/index.ts so it runs
// before any other module loads. If SENTRY_DSN isn't set, init() is a
// no-op and captureException becomes a silent function - safe in dev.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;
const PERSONAL_DATA_KEYS = new Set([
  "email",
  "firstName",
  "lastName",
  "fullName",
  "company",
  "organization",
  "contactEmail",
  "contactName",
  "contactCompany",
  "recipientEmail",
]);
const EMAIL_ADDRESS = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g;

function isPersonalDataKey(key: string | undefined, parentKey: string | undefined): boolean {
  return (
    PERSONAL_DATA_KEYS.has(key ?? "") ||
    (key === "name" && (parentKey === "user" || parentKey === "contact"))
  );
}

export function redactSentryValue(
  value: unknown,
  key?: string,
  depth = 0,
  parentKey?: string,
): unknown {
  if (isPersonalDataKey(key, parentKey)) return "[redacted]";
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") return value.replace(EMAIL_ADDRESS, "[redacted]");
  if (Array.isArray(value))
    return value.map((entry) => redactSentryValue(entry, undefined, depth + 1, key));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactSentryValue(entryValue, entryKey, depth + 1, key),
    ]),
  );
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    // No automatic performance traces by default - turn on when needed.
    // Setting tracesSampleRate to 0 disables transactions but keeps error capture.
    tracesSampleRate: 0,
    // Don't send default PII; we attach our own context (user.id only) via
    // Sentry.setUser inside the auth middleware.
    sendDefaultPii: false,
    beforeSend(event) {
      return redactSentryValue(event) as typeof event;
    },
    // Surface uncaught exceptions and unhandled rejections too.
    integrations: (defaults) => defaults,
  });
}

export { Sentry };
