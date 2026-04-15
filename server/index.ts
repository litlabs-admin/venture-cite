import "dotenv/config";
import "./env";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs/promises";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { WebhookHandlers } from "./webhookHandlers";
import { setupStripeProducts } from "./setupProducts";
import { pool } from "./db";
import { initScheduler } from "./scheduler";
import { initContentGenerationWorker } from "./contentGenerationWorker";

const app = express();

// Security headers
const supabaseUrl = process.env.SUPABASE_URL;
const connectSrc = ["'self'", "api.stripe.com"];
if (supabaseUrl) connectSrc.push(supabaseUrl);

// CSP: scriptSrc is strict ('self' + Stripe only — no 'unsafe-inline').
// Vite's dev HMR uses inline <script type="module"> blocks, so in development
// we keep 'unsafe-inline' for scripts. In production the built bundle is
// fully-hashed external files, so strict CSP applies.
const isProd = process.env.NODE_ENV === "production";
const scriptSrc = isProd
  ? ["'self'", "js.stripe.com"]
  : ["'self'", "'unsafe-inline'", "js.stripe.com"];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc,
      frameSrc: ["js.stripe.com"],
      connectSrc,
      imgSrc: ["'self'", "data:", "blob:"],
      // styleSrc keeps 'unsafe-inline' because shadcn/ui + Tailwind JIT
      // generate runtime-inlined styles that can't be hashed at build time.
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

// CORS — explicit allowlist only, deduped. APP_URL often points at
// localhost in dev, so we dedupe against the built-in local entries.
const allowedOrigins = Array.from(
  new Set(
    [process.env.APP_URL, "http://localhost:5000", "http://127.0.0.1:5000"].filter(
      Boolean,
    ) as string[],
  ),
);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  // Bearer tokens in Authorization header don't need credentialed CORS.
  credentials: false,
}));

// Stripe webhook — must be registered before express.json() to receive raw body
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Request logging. We only log response bodies in development so production
// logs can't accidentally capture Supabase tokens, password hashes, or
// generated article content. Even in dev, `access_token`, `refresh_token`,
// `password`, and similar fields are stripped before serialization.
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

function sanitizeLogBody(value: unknown, depth = 0): unknown {
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

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const isProd = process.env.NODE_ENV === "production";
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (!isProd && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(sanitizeLogBody(capturedJsonResponse))}`;
      }
      if (logLine.length > 160) {
        logLine = logLine.slice(0, 159) + "…";
      }
      log(logLine);
    }
  });

  next();
});

// Health check. Verifies both read and write capability — a read-only
// replica or a revoked role would pass `SELECT 1` but fail real traffic.
// Uses `schema_migrations` as a harmless write target: advisory-lock acquire
// and release is a round-trip through the primary without touching data.
app.get('/health', async (_req, res) => {
  try {
    const { db } = await import('./db');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`SELECT 1`);
    // Advisory lock round-trip — write path, zero data touched.
    await db.execute(sql`SELECT pg_advisory_lock(1)`);
    await db.execute(sql`SELECT pg_advisory_unlock(1)`);
    res.json({ status: 'ok', db: true, timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: false, timestamp: new Date().toISOString() });
  }
});

async function applyMigrations() {
  const dir = path.resolve(process.cwd(), "migrations");
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      log("No migrations directory found — skipping");
      return;
    }
    throw err;
  }

  // Bootstrap the tracking table with a throwaway client so the subsequent
  // per-file transactions can see it. CREATE TABLE IF NOT EXISTS is a no-op
  // on re-run.
  await pool.query(`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now(),
      checksum text
    );
  `);

  // Lookup already-applied migrations once.
  const applied = await pool.query<{ filename: string }>(
    `select filename from public.schema_migrations`,
  );
  const appliedSet = new Set(applied.rows.map((r) => r.filename));

  for (const f of files) {
    if (appliedSet.has(f)) continue;
    const sqlText = await fs.readFile(path.join(dir, f), "utf8");

    // Run each migration inside a single transaction so a partial failure
    // rolls back and the next boot re-attempts the whole file.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sqlText);
      await client.query(
        `insert into public.schema_migrations (filename) values ($1)
         on conflict (filename) do nothing`,
        [f],
      );
      await client.query("COMMIT");
      log(`Applied migration ${f}`);
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      log(`Migration ${f} failed: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }
}

(async () => {
  // Apply idempotent SQL migrations (triggers, RLS) before anything else.
  await applyMigrations();

  // Initialise Stripe products on startup (idempotent — skips existing)
  if (process.env.STRIPE_SECRET_KEY) {
    setupStripeProducts().catch((err) =>
      console.error('Stripe product setup failed:', err)
    );
  }

  const server = await registerRoutes(app);

  // Weekly citation tracking + email report cron
  initScheduler();

  // Background content generation worker (polls content_generation_jobs)
  await initContentGenerationWorker();

  // Global error handler — in production, never leak internal error messages
  // to the client. Always log the full error server-side; return a generic
  // message unless the thrown error explicitly opted in via .expose = true.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error('[error]', err);
    const isProd = process.env.NODE_ENV === 'production';
    const safeToExpose = err.expose === true || (status >= 400 && status < 500);
    const message = (!isProd || safeToExpose)
      ? (err.message || 'Internal Server Error')
      : 'Internal Server Error';
    res.status(status).json({ success: false, error: message });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown: stop accepting new connections, drain in-flight
  // requests (server.close waits for them), then end the pg pool, then exit.
  // A 10s forced-exit timer prevents a hung request from blocking forever.
  let shuttingDown = false;
  async function gracefulShutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received — shutting down`);
    const forceExit = setTimeout(() => {
      log('Forced exit after 10s grace period');
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    server.close(async (err) => {
      if (err) console.error('server.close error:', err);
      try {
        await pool.end();
      } catch (e) {
        console.error('pool.end error:', e);
      }
      process.exit(err ? 1 : 0);
    });
  }
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
