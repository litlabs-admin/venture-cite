import "dotenv/config";
import "./env";
// Sentry must be imported before any module that throws or makes network
// calls so its instrumentation is active for the whole process. No-op if
// SENTRY_DSN isn't set.
import { Sentry } from "./instrument";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { WebhookHandlers } from "./webhookHandlers";
import { setupStripeProducts } from "./setupProducts";
import { pool } from "./db";
import { initScheduler } from "./scheduler";
import { initContentGenerationWorker } from "./contentGenerationWorker";
import { logger, requestContext, sanitizeLogBody } from "./lib/logger";

const app = express();

// Trust the first proxy hop (load balancer / Cloudflare / Render / etc.)
// so `req.protocol` and `req.ip` reflect the original client. Required for
// the HTTPS redirect below and for accurate rate-limiting keys.
app.set("trust proxy", 1);

// Security headers
const supabaseUrl = process.env.SUPABASE_URL;
const connectSrc = ["'self'", "api.stripe.com"];
if (supabaseUrl) connectSrc.push(supabaseUrl);

// Brand logos are mirrored into Supabase Storage at scrape time and served
// via the bucket's public URL (<SUPABASE_URL>/storage/...), so img-src has
// to allow the Supabase hostname.
const imgSrc = ["'self'", "data:", "blob:"];
if (supabaseUrl) imgSrc.push(supabaseUrl);

// CSP: scriptSrc is strict ('self' + Stripe only — no 'unsafe-inline').
// Vite's dev HMR uses inline <script type="module"> blocks, so in development
// we keep 'unsafe-inline' for scripts. In production the built bundle is
// fully-hashed external files, so strict CSP applies.
const isProd = process.env.NODE_ENV === "production";
const scriptSrc = isProd
  ? ["'self'", "js.stripe.com"]
  : ["'self'", "'unsafe-inline'", "js.stripe.com"];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc,
        frameSrc: ["js.stripe.com"],
        connectSrc,
        imgSrc,
        // styleSrc keeps 'unsafe-inline' because shadcn/ui + Tailwind JIT
        // generate runtime-inlined styles that can't be hashed at build time.
        // Google Fonts stylesheets are served from fonts.googleapis.com and
        // font files from fonts.gstatic.com.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      },
    },
    // HSTS: tell browsers to refuse HTTP for this origin for 1 year.
    // includeSubDomains + preload enable submission to the HSTS preload
    // list (https://hstspreload.org), which bakes the rule into the
    // browser binary — no first-visit MITM window. Only active in prod;
    // in dev we serve over HTTP so HSTS would lock you out of localhost.
    hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
  }),
);

// HTTPS redirect: in production, any plain-HTTP request that wasn't
// terminated as HTTPS upstream gets a 301 to its https:// equivalent.
// Bearer tokens in cleartext over HTTP would be a session-takeover
// vector, so we never serve real responses on HTTP in prod.
//
// `req.secure` already honors `X-Forwarded-Proto` because of the
// `trust proxy` setting above. /health is exempt so load balancer
// probes can stay on HTTP if needed.
if (isProd) {
  app.use((req, res, next) => {
    if (req.secure) return next();
    if (req.path === "/health") return next();
    const host = req.headers.host;
    if (!host) return res.status(400).send("Bad Request: missing Host header");
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

// CORS — explicit allowlist only, deduped. APP_URL often points at
// localhost in dev, so we dedupe against the built-in local entries.
//
// Auto-expand the allowlist to cover the bare-apex / www mirror of every
// env-supplied origin: if APP_URL is https://venturecite.com we also accept
// https://www.venturecite.com (and vice-versa), so DNS pointing both names
// at the same service doesn't require a code change to add the alternate.
function expandApexAndWww(origin: string): string[] {
  try {
    const u = new URL(origin);
    const host = u.hostname;
    // Browser Origin headers never include a path or trailing slash. Build
    // canonical form `${protocol}//${host}[:${port}]` so a trailing slash in
    // APP_URL doesn't silently break the allowlist match.
    const port = u.port ? `:${u.port}` : "";
    const canonical = `${u.protocol}//${host}${port}`;
    const out = new Set<string>([canonical]);
    if (host.startsWith("www.")) {
      out.add(`${u.protocol}//${host.slice(4)}${port}`);
    } else if (!host.includes(".") || host.split(".").length === 2) {
      // Bare apex like `venturecite.com` — also accept `www.venturecite.com`.
      out.add(`${u.protocol}//www.${host}${port}`);
    }
    return Array.from(out);
  } catch {
    return [origin.replace(/\/+$/, "")];
  }
}

// EXTRA_CORS_ORIGINS is a comma-separated list for staging/preview deploys.
const extra = (process.env.EXTRA_CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set(
    [
      ...(process.env.APP_URL ? expandApexAndWww(process.env.APP_URL) : []),
      ...extra.flatMap(expandApexAndWww),
      "http://localhost:5000",
      "http://127.0.0.1:5000",
    ].filter(Boolean),
  ),
);

// Log the resolved CORS allowlist on boot so misconfiguration is visible
// immediately instead of buried in 500 logs after the first request.
log(`CORS allowlist: ${allowedOrigins.join(", ") || "(none)"}`);

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  // Bearer tokens in Authorization header don't need credentialed CORS.
  credentials: false,
});

// Only run CORS on /api/* requests. Static assets (HTML, JS, CSS, fonts)
// are served same-origin from this same server — they don't need CORS,
// and Vite's `crossorigin` script tags would otherwise trigger a CORS
// rejection on a same-origin request that happens to include an Origin
// header. Limiting CORS to the API surface fixes the spurious 500s on
// /assets/* without weakening the API's origin gate.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return corsMiddleware(req, res, next);
  return next();
});

// Stripe webhook — must be registered before express.json() to receive raw body
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ error: "Missing stripe-signature" });
  }

  try {
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!Buffer.isBuffer(req.body)) {
      logger.error("Stripe webhook: req.body is not a Buffer");
      return res.status(500).json({ error: "Webhook processing error" });
    }
    await WebhookHandlers.processWebhook(req.body as Buffer, sig);
    res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error({ err: error }, "Stripe webhook error");
    Sentry.captureException(error, { tags: { source: "stripe-webhook" } });
    res.status(400).json({ error: "Webhook processing error" });
  }
});

// Shopify webhook — also needs raw body for HMAC verification, so it
// must be registered before express.json(). Lives here (not routes.ts)
// for the same reason as the Stripe handler. Fail-closed if
// SHOPIFY_WEBHOOK_SECRET is unset; idempotent on retries.
app.post(
  "/webhooks/shopify/orders",
  express.raw({ type: ["application/json", "application/*+json"] }),
  async (req, res) => {
    const hmacHeader = req.headers["x-shopify-hmac-sha256"];
    const webhookId = req.headers["x-shopify-webhook-id"];
    const topic = req.headers["x-shopify-topic"];
    const shopDomain = req.headers["x-shopify-shop-domain"];

    if (!hmacHeader || !webhookId || !topic) {
      return res.status(400).json({ error: "Missing required Shopify headers" });
    }
    if (!Buffer.isBuffer(req.body)) {
      logger.error("Shopify webhook: req.body is not a Buffer");
      return res.status(500).json({ error: "Webhook processing error" });
    }

    const hmac = Array.isArray(hmacHeader) ? hmacHeader[0] : hmacHeader;
    const wid = Array.isArray(webhookId) ? webhookId[0] : webhookId;
    const tpc = Array.isArray(topic) ? topic[0] : topic;
    const dom = Array.isArray(shopDomain) ? shopDomain[0] : shopDomain;

    try {
      const result = await WebhookHandlers.processShopifyOrder(req.body, {
        hmac,
        webhookId: wid,
        topic: tpc,
        shopDomain: dom,
      });
      if (!result.processed) {
        if (result.reason === "invalid_signature" || result.reason === "missing_secret") {
          // Don't echo the reason — that's information disclosure.
          return res.status(401).json({ error: "Unauthorized" });
        }
        // duplicate — Shopify treats 200 as "stop retrying" which is what we want
      }
      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error({ err: error }, "Shopify webhook error");
      Sentry.captureException(error, { tags: { source: "shopify-webhook" } });
      res.status(500).json({ error: "Webhook processing error" });
    }
  },
);

// Resend webhook (Wave 3.6) — Svix-style signed payload, also needs raw
// body for HMAC. Updates users.email_status when the recipient bounces
// or marks our mail as spam, so the email service stops sending to them.
app.post(
  "/api/webhooks/resend",
  express.raw({ type: ["application/json", "application/*+json"] }),
  async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      // Fail closed — without a secret every request is unauthenticated.
      return res.status(401).json({ error: "Unauthorized" });
    }
    const svixId = String(req.headers["svix-id"] ?? "");
    const svixTimestamp = String(req.headers["svix-timestamp"] ?? "");
    const svixSignature = String(req.headers["svix-signature"] ?? "");

    if (!Buffer.isBuffer(req.body)) {
      logger.error("Resend webhook: req.body is not a Buffer");
      return res.status(500).json({ error: "Webhook processing error" });
    }

    const { verifyResendWebhook } = await import("./lib/resendWebhook");
    const ok = verifyResendWebhook({
      rawBody: req.body,
      svixId,
      svixTimestamp,
      svixSignature,
      secret,
    });
    if (!ok) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const event = JSON.parse(req.body.toString("utf8")) as {
        type?: string;
        data?: { to?: string | string[]; email_id?: string };
      };
      const recipientList = Array.isArray(event.data?.to)
        ? event.data?.to
        : event.data?.to
          ? [event.data.to]
          : [];

      // Map Resend event type → our email_status enum.
      const statusByType: Record<string, "bounced" | "complained" | "active" | undefined> = {
        "email.bounced": "bounced",
        "email.complained": "complained",
        "email.delivered": "active",
      };
      const newStatus = event.type ? statusByType[event.type] : undefined;
      if (newStatus && recipientList.length > 0) {
        const { db } = await import("./db");
        const { users } = await import("@shared/schema");
        const { inArray } = await import("drizzle-orm");
        await db
          .update(users)
          .set({ emailStatus: newStatus })
          .where(inArray(users.email, recipientList));
        logger.info(
          { type: event.type, recipients: recipientList.length, newStatus },
          "resend webhook processed",
        );
      } else {
        logger.info(
          { type: event.type, recipients: recipientList.length },
          "resend webhook: ignored (unhandled type)",
        );
      }
      res.status(200).json({ received: true });
    } catch (err) {
      logger.error({ err }, "Resend webhook handler error");
      Sentry.captureException(err, { tags: { source: "resend-webhook" } });
      res.status(500).json({ error: "Webhook processing error" });
    }
  },
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Request-ID + structured-logging middleware.
//
// Every incoming request gets a UUID (or honors an upstream `x-request-id`
// header for trace propagation through proxies). The ID is echoed back on
// the response and pushed into AsyncLocalStorage so any downstream log
// line — controller, service, worker callback — automatically includes it.
//
// We keep the existing one-line summary log on `res.finish` for parity
// with the previous output, but emit it via Pino so it has structured
// fields and the request ID. In dev we still attach a sanitized response
// preview to aid debugging; never in prod.
app.use((req, res, next) => {
  const inboundId = (req.headers["x-request-id"] as string | undefined)?.trim();
  const requestId = inboundId && inboundId.length > 0 ? inboundId : uuidv4();
  res.setHeader("x-request-id", requestId);

  requestContext.run({ requestId }, () => {
    const start = Date.now();
    const reqPath = req.path;
    const isProd = process.env.NODE_ENV === "production";
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (!reqPath.startsWith("/api")) return;

      const fields = {
        method: req.method,
        path: reqPath,
        status: res.statusCode,
        durationMs: duration,
        ...(isProd
          ? {}
          : {
              response: capturedJsonResponse ? sanitizeLogBody(capturedJsonResponse) : undefined,
            }),
      };

      // Mirror the prior behavior: keep a short human-readable summary in
      // the dev console using `log()` so existing visual scanning still
      // works, while structured Pino entry goes to stdout for aggregation.
      logger.info(fields, `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`);
      if (!isProd) {
        let summary = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
        if (summary.length > 160) summary = summary.slice(0, 159) + "…";
        log(summary);
      }
    });

    next();
  });
});

// Health check. Verifies both read and write capability — a read-only
// replica or a revoked role would pass `SELECT 1` but fail real traffic.
// Uses `schema_migrations` as a harmless write target: advisory-lock acquire
// and release is a round-trip through the primary without touching data.
app.get("/health", async (_req, res) => {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    // Advisory lock round-trip — write path, zero data touched.
    await db.execute(sql`SELECT pg_advisory_lock(1)`);
    await db.execute(sql`SELECT pg_advisory_unlock(1)`);
    res.json({ status: "ok", db: true, timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", db: false, timestamp: new Date().toISOString() });
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
    setupStripeProducts().catch((err) => {
      logger.error({ err }, "Stripe product setup failed");
      Sentry.captureException(err, { tags: { source: "stripe-setup" } });
    });
  }

  const server = await registerRoutes(app);

  // Weekly citation tracking + email report cron
  initScheduler();

  // Background content generation worker (polls content_generation_jobs)
  await initContentGenerationWorker();

  // Resume any onboarding auto-pilot runs that were in-flight when the
  // process last stopped.
  const { resumeInFlightAutopilots } = await import("./lib/onboardingAutopilot");
  void resumeInFlightAutopilots();

  // Global error handler — in production, never leak internal error messages
  // to the client. Always log the full error server-side; return a generic
  // message unless the thrown error explicitly opted in via .expose = true.
  // 5xx errors are reported to Sentry; 4xx are expected client mistakes and
  // skipped to avoid noise.
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const isProd = process.env.NODE_ENV === "production";
    const safeToExpose = err.expose === true || (status >= 400 && status < 500);
    const message =
      !isProd || safeToExpose ? err.message || "Internal Server Error" : "Internal Server Error";

    logger.error(
      { err, status, method: req.method, path: req.path },
      `request failed: ${req.method} ${req.path}`,
    );
    if (status >= 500) {
      Sentry.captureException(err, {
        tags: { source: "global-error-handler", path: req.path, method: req.method },
      });
    }

    res.status(status).json({ success: false, error: message });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
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
      log("Forced exit after 10s grace period");
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    server.close(async (err) => {
      if (err) logger.error({ err }, "server.close error");
      try {
        await pool.end();
      } catch (e) {
        logger.error({ err: e }, "pool.end error");
      }
      // Best-effort flush so in-flight Sentry events make it out before exit.
      await Sentry.close(2_000).catch(() => {});
      process.exit(err ? 1 : 0);
    });
  }
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
