import { z } from "zod";

// Validates required environment variables at startup. Throws a readable
// error (naming every missing/malformed variable) before the server starts
// listening, so the app fails fast instead of silently booting half-broken.
//
// Import this file ONCE, as early as possible in server/index.ts — after
// `dotenv/config` and before any module that reads process.env.

// On Render, RENDER_EXTERNAL_URL is auto-injected and points at the public
// service URL — no manual config needed. We fall back to that when APP_URL
// isn't set so the deploy works out of the box.
//
// Local dev: defaults to http://localhost:5000 if neither is set.
//
// APP_URL still wins when set (it's how you point at a custom domain like
// https://venturecite.com once DNS is wired up — Render's auto URL is the
// *.onrender.com one, which isn't what you want in production).
const resolvedAppUrl =
  process.env.APP_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:5000");
if (resolvedAppUrl) process.env.APP_URL = resolvedAppUrl;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.string().optional(),
    APP_URL: z.string().url(),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

    STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),

    OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

    // Optional — features degrade if absent, but shouldn't block boot.
    OPENROUTER_API_KEY: z.string().optional(),
    PUBLIC_BASE_URL: z.string().url().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    VITE_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    VITE_SUPABASE_URL: z.string().url().optional(),
    VITE_SUPABASE_ANON_KEY: z.string().optional(),

    SESSION_SECRET: z.string().optional(),

    // Observability — both optional. If SENTRY_DSN is unset, error capture
    // is a silent no-op (safe in dev). LOG_LEVEL defaults to debug in dev,
    // info in prod (handled inside server/lib/logger.ts).
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    VITE_SENTRY_DSN: z.string().url().optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),

    // Postgres TLS hardening (see server/db.ts for the precedence order).
    // Both optional — without them, the pool falls back to permissive TLS
    // (still encrypted, no chain verification) with a boot warning in prod.
    DATABASE_CA_CERT_PATH: z.string().optional(),
    DATABASE_SSL_REJECT_UNAUTHORIZED: z.enum(["true", "false"]).optional(),

    // Shopify webhook secret. When unset, the Shopify webhook endpoint
    // refuses every request (fail closed) — set this to enable the
    // integration. From Shopify admin → Notifications → Webhooks (or
    // app config), copy the "Webhook signing secret".
    SHOPIFY_WEBHOOK_SECRET: z.string().optional(),

    // HMAC secret for email unsubscribe tokens. Falls back to
    // SESSION_SECRET when unset. Generate with `openssl rand -base64 32`.
    EMAIL_UNSUBSCRIBE_SECRET: z.string().optional(),

    // Resend webhook signing secret (Svix-style, prefix "whsec_").
    // From Resend dashboard → Webhooks → endpoint → Signing secret.
    // When unset, /api/webhooks/resend rejects every request (fail closed).
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_ADDRESS: z.string().optional(),

    // Stripe API version pin (Wave 3.5). Falls back to a hardcoded
    // version in stripeClient.ts. Set in deploy env if you want to
    // pin to a different version than the SDK ships with.
    STRIPE_API_VERSION: z.string().optional(),

    // AES-256-GCM key for encrypting third-party access tokens at rest
    // (currently: Buffer OAuth token in users.buffer_access_token).
    // Generate with `openssl rand -base64 32` (must decode to 32 bytes).
    // Required when BUFFER_CLIENT_ID is set; otherwise unused. Validated
    // by the refine() below.
    BUFFER_ENCRYPTION_KEY: z.string().optional(),

    BUFFER_CLIENT_ID: z.string().optional(),
    BUFFER_CLIENT_SECRET: z.string().optional(),
    BUFFER_REDIRECT_URI: z.string().url().optional(),
  })
  .refine(
    (env) => {
      // If Buffer integration is enabled, require an encryption key — else
      // we'd silently store new OAuth tokens in plaintext.
      if (env.BUFFER_CLIENT_ID && !env.BUFFER_ENCRYPTION_KEY) return false;
      return true;
    },
    {
      message:
        "BUFFER_ENCRYPTION_KEY is required when BUFFER_CLIENT_ID is set. " +
        "Generate one with `openssl rand -base64 32`.",
      path: ["BUFFER_ENCRYPTION_KEY"],
    },
  );

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Environment validation failed:\n${issues}`);
}

export const env = parsed.data;
