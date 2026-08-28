import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type LoggerOptions } from "pino";

// Per-request context propagated through async stacks. The HTTP middleware
// runs the rest of the request inside `requestContext.run({...}, next)`, so
// any code path during that request can read `requestContext.getStore()` to
// retrieve the request ID, user ID, etc. - without threading it through
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
const AI_LOG_STRING_LIMIT = 2000;
const AI_BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const AI_API_KEY = /\b(?:sk|rk|pk)[_-][A-Za-z0-9_-]{8,}\b/g;
const AI_JWT = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const AI_SECRET_ASSIGNMENT =
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|token)\s*[:=]\s*(?:Bearer\s+)?[^\s,;}'"`]+/gi;
const NORMALIZED_SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "token",
  "secret",
  "apikey",
  "email",
  "firstname",
  "lastname",
  "fullname",
  "company",
  "organization",
  "contactemail",
  "contactname",
  "contactcompany",
  "recipientemail",
]);

function sanitizeLogString(value: string): string {
  const scrubbed = value.replace(EMAIL_ADDRESS, "[redacted]");
  return scrubbed.length > 200 ? scrubbed.slice(0, 197) + "…" : scrubbed;
}

function isSensitiveKey(key: string): boolean {
  return NORMALIZED_SENSITIVE_KEYS.has(key.replace(/[_-]/g, "").toLowerCase());
}

function sanitizeAiLogString(value: string): string {
  const scrubbed = value
    .replace(EMAIL_ADDRESS, "[redacted]")
    .replace(AI_BEARER_TOKEN, "Bearer [redacted]")
    .replace(AI_API_KEY, "[redacted]")
    .replace(AI_JWT, "[redacted]")
    .replace(AI_SECRET_ASSIGNMENT, "[redacted]");
  return scrubbed.length > AI_LOG_STRING_LIMIT
    ? scrubbed.slice(0, AI_LOG_STRING_LIMIT - 3) + "..."
    : scrubbed;
}

function sanitizeAiLogPayload(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeAiLogString(value);
  if (value instanceof Error) return { name: value.name };
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((entry) => sanitizeAiLogPayload(entry, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? "[redacted]" : sanitizeAiLogPayload(entry, depth + 1);
  }
  return out;
}

function isLogRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Strip sensitive values, truncate long strings, cap recursion. Used by the
// dev-mode request logger which may dump arbitrary response bodies.
export function sanitizeLogBody(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeLogString(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogString(value.message),
      stack: value.stack ? sanitizeLogString(value.stack) : undefined,
      cause: value.cause ? sanitizeLogBody(value.cause, depth + 1) : undefined,
    };
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((v) => sanitizeLogBody(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "aiRequest" || k === "aiResponse") {
      out[k] = sanitizeAiLogPayload(v);
    } else if (SENSITIVE_KEYS.has(k)) {
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
      "*.email",
      "*.firstName",
      "*.lastName",
      "*.fullName",
      "*.company",
      "*.organization",
      "*.contactEmail",
      "*.contactName",
      "*.contactCompany",
      "*.recipientEmail",
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
  formatters: {
    log(fields) {
      const sanitized = sanitizeLogBody(fields);
      return isLogRecord(sanitized) ? sanitized : {};
    },
  },
  serializers: {
    err(error) {
      return sanitizeLogBody(pino.stdSerializers.err(error));
    },
  },
  base: {
    service: "venturecite",
    env: process.env.NODE_ENV ?? "development",
  },
};

// In development, pretty-print to stdout for readability. In production,
// emit JSON lines so log aggregators (Datadog, Better Stack, etc.) can
// parse fields directly.
//
// The pretty transport is built inside a try/catch, and that is load-bearing
// rather than defensive habit. `transport.target` is resolved by pino from a
// STRING at runtime, which no bundler can trace - so a bundle that includes
// this branch but not pino-pretty throws at module load, not at first log.
// This module is imported by the SSR entry, so that throw took down every
// route with an opaque 500: the marketing pages, /health, everything.
//
// It reached production because `process.env.NODE_ENV` is inlined by the
// bundler at BUILD time. The Vercel build ran `vite build` without
// NODE_ENV set (now fixed in package.json), so `isProd` was frozen to
// `false` in the SSR bundle and stayed false no matter what the runtime
// environment said.
//
// Both halves are fixed, but the guard alone is not enough to rely on: a
// logging backend must never be able to take the application down. Losing
// colour in the terminal is an acceptable failure; losing the site is not.
function createLogger() {
  if (isProd) return pino(baseOptions);
  try {
    return pino({
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
  } catch {
    // pino-pretty unavailable (bundled runtime, pruned install). Fall back
    // to structured JSON on stdout - still fully usable, just not pretty.
    return pino(baseOptions);
  }
}

export const logger = createLogger();
