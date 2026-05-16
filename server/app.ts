// Shared Express app builder + lifecycle helpers.
//
// The same configured app instance is reused by:
//   - server/index.ts        (local dev: app.listen)
//   - server/vercelEntry.ts  (Vercel function default export)
//
// Boot side-effects (migrations, scheduler, autopilot resume) only run
// on local dev and are kicked from server/index.ts. On Vercel the daily
// cron orchestrator (/api/cron/daily-orchestrator) handles them.

import "dotenv/config";
import "./env";
// Sentry must be imported before any module that throws or makes network
// calls so its instrumentation is active for the whole process. No-op if
// SENTRY_DSN isn't set.
import { Sentry } from "./instrument";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { v4 as uuidv4 } from "uuid";
import type { Server } from "http";
import { registerRoutes } from "./routes";
import { log } from "./log";
import { WebhookHandlers } from "./webhookHandlers";
import { logger, requestContext, sanitizeLogBody } from "./lib/logger";
import { captureAndFlush } from "./lib/sentryReport";

export const app = express();

app.set("trust proxy", 1);

const supabaseUrl = process.env.SUPABASE_URL;
const connectSrc = ["'self'", "api.stripe.com"];
if (supabaseUrl) connectSrc.push(supabaseUrl);

const imgSrc = ["'self'", "data:", "blob:"];
if (supabaseUrl) imgSrc.push(supabaseUrl);

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
        // 'unsafe-inline' is required because Recharts injects per-chart
        // theme styles via dangerouslySetInnerHTML at component-render
        // time (see client/src/components/ui/chart.tsx). Tightening this
        // to a nonce-based policy is on the post-launch backlog if a
        // security audit requires it.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      },
    },
    hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
  }),
);

if (isProd) {
  app.use((req, res, next) => {
    if (req.secure) return next();
    if (req.path === "/health") return next();
    const host = req.headers.host;
    if (!host) return res.status(400).send("Bad Request: missing Host header");
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

function expandApexAndWww(origin: string): string[] {
  try {
    const u = new URL(origin);
    const host = u.hostname;
    const port = u.port ? `:${u.port}` : "";
    const canonical = `${u.protocol}//${host}${port}`;
    const out = new Set<string>([canonical]);
    if (host.startsWith("www.")) {
      out.add(`${u.protocol}//${host.slice(4)}${port}`);
    } else if (!host.includes(".") || host.split(".").length === 2) {
      out.add(`${u.protocol}//www.${host}${port}`);
    }
    return Array.from(out);
  } catch {
    return [origin.replace(/\/+$/, "")];
  }
}

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
log(`CORS allowlist: ${allowedOrigins.join(", ") || "(none)"}`);

// Vercel auto-injects preview deploy URLs as *.vercel.app. Allowing the
// suffix lets feature-branch previews work without manually maintaining
// a per-deploy EXTRA_CORS_ORIGINS list. Production should still pin
// APP_URL to the real domain so browsers refuse spoofed previews.
function isVercelPreview(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && u.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || isVercelPreview(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: false,
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return corsMiddleware(req, res, next);
  return next();
});

// ─── Webhook handlers (raw body — must run BEFORE express.json) ───

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ error: "Missing stripe-signature" });
  }
  try {
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!Buffer.isBuffer(req.body)) {
      // Fires if Vercel pre-parsed the body before Express saw the
      // stream — would mean signature verification can never succeed.
      // Log loudly so it surfaces on first deploy.
      logger.error(
        { bodyType: typeof req.body },
        "Stripe webhook: req.body is not a Buffer (raw-body parsing broken)",
      );
      return res.status(500).json({ error: "Webhook processing error" });
    }
    await WebhookHandlers.processWebhook(req.body as Buffer, sig);
    res.status(200).json({ received: true });
  } catch (error: unknown) {
    logger.error({ err: error }, "Stripe webhook error");
    captureAndFlush(error, { tags: { source: "stripe-webhook" } });
    res.status(400).json({ error: "Webhook processing error" });
  }
});

app.post(
  "/api/webhooks/resend",
  express.raw({ type: ["application/json", "application/*+json"] }),
  async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
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

      const statusByType: Record<string, "bounced" | "complained" | "active" | undefined> = {
        "email.bounced": "bounced",
        "email.complained": "complained",
        "email.delivered": "active",
      };
      const newStatus = event.type ? statusByType[event.type] : undefined;
      if (newStatus && recipientList && recipientList.length > 0) {
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
          { type: event.type, recipients: (recipientList ?? []).length },
          "resend webhook: ignored (unhandled type)",
        );
      }
      res.status(200).json({ received: true });
    } catch (err) {
      logger.error({ err }, "Resend webhook handler error");
      captureAndFlush(err, { tags: { source: "resend-webhook" } });
      res.status(500).json({ error: "Webhook processing error" });
    }
  },
);

// ─── Body parsers ───
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// ─── Request-ID + structured-logging middleware ───
app.use((req, res, next) => {
  const inboundId = (req.headers["x-request-id"] as string | undefined)?.trim();
  const requestId = inboundId && inboundId.length > 0 ? inboundId : uuidv4();
  res.setHeader("x-request-id", requestId);

  requestContext.run({ requestId }, () => {
    const start = Date.now();
    const reqPath = req.path;
    const isProdLocal = process.env.NODE_ENV === "production";
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json.bind(res);
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson as Record<string, unknown>;
      return originalResJson(bodyJson, ...args);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (!reqPath.startsWith("/api")) return;

      const fields = {
        method: req.method,
        path: reqPath,
        status: res.statusCode,
        durationMs: duration,
        ...(isProdLocal
          ? {}
          : {
              response: capturedJsonResponse ? sanitizeLogBody(capturedJsonResponse) : undefined,
            }),
      };
      logger.info(fields, `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`);
      if (!isProdLocal) {
        let summary = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
        if (summary.length > 160) summary = summary.slice(0, 159) + "…";
        log(summary);
      }
    });

    next();
  });
});

// ─── Health check ───
//
// Vercel migration: dropped the advisory-lock round-trip. SELECT 1 is
// enough to confirm the function reached the DB; cold-start contention
// on a global lock is undesirable on serverless.
app.get("/health", async (_req, res) => {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", db: true, timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", db: false, timestamp: new Date().toISOString() });
  }
});

// ─── App preparation ───
//
// Returns once routes are registered and the global error handler is
// installed. Cached: subsequent calls return the same in-flight promise
// so concurrent requests on cold start don't double-register routes.
let prepared: Promise<Server> | null = null;
export function prepareApp(): Promise<Server> {
  if (prepared) return prepared;
  prepared = (async () => {
    const server = await registerRoutes(app);

    // Global error handler — appended last so all earlier routes can
    // throw and have it normalize the response shape.
    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const isProdLocal = process.env.NODE_ENV === "production";
      const safeToExpose = err.expose === true || (status >= 400 && status < 500);
      const message =
        !isProdLocal || safeToExpose
          ? err.message || "Internal Server Error"
          : "Internal Server Error";

      logger.error(
        { err, status, method: req.method, path: req.path },
        `request failed: ${req.method} ${req.path}`,
      );
      if (status >= 500) {
        captureAndFlush(err, {
          tags: { source: "global-error-handler", path: req.path, method: req.method },
        });
      }
      res.status(status).json({ success: false, error: message });
    });

    return server;
  })();
  return prepared;
}
