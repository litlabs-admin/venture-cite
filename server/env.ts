import { z } from "zod";
import { resolveDatabaseTlsPolicy } from "./lib/databaseTlsPolicy";

// Validates required environment variables at startup. Throws a readable
// error (naming every missing/malformed variable) before the server starts
// listening, so the app fails fast instead of silently booting half-broken.
//
// Import this file ONCE, as early as possible in server/index.ts - after
// `dotenv/config` and before any module that reads process.env.

// Auto-resolve the public app URL so a fresh deploy works without manual
// APP_URL config. Order:
//   1. APP_URL (explicit override - wins when set)
//   2. VERCEL_URL (auto-injected by Vercel - *.vercel.app, no protocol)
//   3. http://localhost:5000 in dev
const resolvedAppUrl =
  process.env.APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:5000");
if (resolvedAppUrl) process.env.APP_URL = resolvedAppUrl;

const envSchemaBase = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().optional(),
  APP_URL: z.string().url(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  // Billing is OPTIONAL at boot. Every consumer already degrades on its own:
  // stripeClient.ts throws from getStripeKey() only when a client is actually
  // requested, webhookHandlers.ts checks STRIPE_WEBHOOK_SECRET per request,
  // and both boot paths (server/index.ts, server/nitroBoot.ts) already guard
  // product setup behind `if (process.env.STRIPE_SECRET_KEY)`.
  //
  // Requiring them here was the one thing that turned "billing not configured"
  // into "the entire site is down" - including the public marketing pages,
  // which never touch Stripe. A missing payment integration should disable
  // payments, not the homepage. Checkout and webhook endpoints still fail
  // loudly and specifically at the point of use.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRODUCT_ID: z.string().startsWith("prod_").optional(),
  STRIPE_PRO_PRICE_ID: z.string().startsWith("price_").optional(),
  STRIPE_AGENCY_PRODUCT_ID: z.string().startsWith("prod_").optional(),
  STRIPE_AGENCY_PRICE_ID: z.string().startsWith("price_").optional(),

  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

  // Optional - features degrade if absent, but shouldn't block boot.
  // OPENROUTER_API_KEY is optional in core, but REQUIRED at runtime for the
  // chatbot endpoint. The endpoint throws a clear error if missing - easier
  // to debug than a process-startup hard-fail in environments that don't
  // use the chatbot.
  OPENROUTER_API_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),

  SESSION_SECRET: z.string().optional(),

  // Observability - both optional. If SENTRY_DSN is unset, error capture
  // is a silent no-op (safe in dev). LOG_LEVEL defaults to debug in dev,
  // info in prod (handled inside server/lib/logger.ts).
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  VITE_SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),

  // Production requires one certificate verification option.
  DATABASE_CA_CERT_PATH: z.string().optional(),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.enum(["true", "false"]).optional(),

  // HMAC secret for email unsubscribe tokens. Falls back to
  // SESSION_SECRET when unset. Generate with `openssl rand -base64 32`.
  EMAIL_UNSUBSCRIBE_SECRET: z.string().optional(),

  // Resend webhook signing secret (Svix-style, prefix "whsec_").
  // From Resend dashboard → Webhooks → endpoint → Signing secret.
  // When unset, /api/webhooks/resend rejects every request (fail closed).
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_ADDRESS: z.string().optional(),

  // Stripe API version pin. Falls back to a hardcoded
  // version in stripeClient.ts. Set in deploy env if you want to
  // pin to a different version than the SDK ships with.
  STRIPE_API_VERSION: z.string().optional(),

  // AES-256-GCM key for encrypting user-supplied Buffer access tokens
  // at rest (users.buffer_access_token). Generate with
  // `openssl rand -base64 32` (must decode to 32 bytes). Optional -
  // tokenCipher only loads it lazily, so deployments that don't use the
  // Buffer feature don't need to set it.
  BUFFER_ENCRYPTION_KEY: z.string().optional(),

  // Set to "true" when an EXTERNAL scheduler drives
  // POST /api/cron/daily-orchestrator, so the in-process node-cron scheduler
  // does not run the same six jobs a second time. Required on Render free
  // tier, where the process sleeps and the in-process scheduler is unreliable
  // anyway. See server/nitroBoot.ts and render.yaml.
  DISABLE_IN_PROCESS_SCHEDULER: z.string().optional(),

  // No REDDIT_* credentials. The mention scanner reads Reddit
  // unauthenticated only (public JSON + RSS fallback); the OAuth path and
  // these four vars were removed together. Re-declaring them here would
  // advertise a configuration that nothing reads.
});

const envSchema = envSchemaBase.superRefine((value, context) => {
  try {
    resolveDatabaseTlsPolicy(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["DATABASE_SSL_REJECT_UNAUTHORIZED"],
      message: error instanceof Error ? error.message : "Invalid database TLS configuration",
    });
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Environment validation failed:\n${issues}`);
}

export const env = parsed.data;
