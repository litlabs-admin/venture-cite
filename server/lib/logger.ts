import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type LoggerOptions } from "pino";

// Per-request context propagated through async stacks. The HTTP middleware
// runs the rest of the request inside `requestContext.run({...}, next)`, so
// any code path during that request can read `requestContext.getStore()` to
// retrieve the request ID, user ID, etc. — without threading it through
// every function signature.
export interface RequestContext {
  requestId: string;
  userId?: string;
  brandId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

// Fields that must never appear in logs. The Pino `redact` config below
// scrubs them at log time. `sanitizeLogBody` is a separate utility used by
// the request logger to truncate bodies before they're stringified.
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "access_token",
  "refresh_token",
  "authorization",
  "token",
  "secret",
  "apiKey",
  "api_key",
]);

// Strip sensitive values, truncate long strings, cap recursion. Used by the
// dev-mode request logger which may dump arbitrary response bodies.
export function sanitizeLogBody(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 200 ? value.slice(0, 197) + "…" : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((v) => sanitizeLogBody(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = sanitizeLogBody(v, depth + 1);
    }
  }
  return out;
}

const isProd = process.env.NODE_ENV === "production";

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  // Pino redacts these JSON paths from any log object before output. Belt-
  // and-braces with `sanitizeLogBody`: redaction here covers structured
  // fields, sanitizer covers free-form bodies.
  redact: {
    paths: [
      "password",
      "passwordHash",
      "access_token",
      "refresh_token",
      "token",
      "authorization",
      "secret",
      "apiKey",
      "api_key",
      "*.password",
      "*.passwordHash",
      "*.access_token",
      "*.refresh_token",
      "*.token",
      "*.authorization",
      "*.secret",
      "*.apiKey",
      "*.api_key",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
  // Inject request-scoped context into every log line emitted during the
  // request lifecycle. If there's no active context (e.g. boot logs, cron
  // jobs outside a request), this returns an empty object.
  mixin() {
    const ctx = requestContext.getStore();
    return ctx ? { requestId: ctx.requestId, userId: ctx.userId } : {};
  },
  base: {
    service: "venturecite",
    env: process.env.NODE_ENV ?? "development",
  },
};

// In development, pretty-print to stdout for readability. In production,
// emit JSON lines so log aggregators (Datadog, Better Stack, etc.) can
// parse fields directly.
export const logger = isProd
  ? pino(baseOptions)
  : pino({
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname,service,env",
        },
      },
    });
