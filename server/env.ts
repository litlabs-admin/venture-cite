import { z } from "zod";

// Validates required environment variables at startup. Throws a readable
// error (naming every missing/malformed variable) before the server starts
// listening, so the app fails fast instead of silently booting half-broken.
//
// Import this file ONCE, as early as possible in server/index.ts — after
// `dotenv/config` and before any module that reads process.env.

const envSchema = z.object({
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
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Environment validation failed:\n${issues}`);
}

export const env = parsed.data;
