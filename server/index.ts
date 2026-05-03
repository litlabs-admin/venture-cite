// Local dev / Render entry point.
//
// Vercel migration: most middleware + route registration moved to
// server/app.ts so the same configured app instance is reused by both
// the long-running Node server (this file) and the Vercel function
// (api/index.ts). Boot side-effects (migrations, scheduler, autopilot
// resume) only run here — Vercel handles them via the daily cron.

import { app, prepareApp } from "./app";
import { Sentry } from "./instrument";
import { setupVite, serveStatic, log } from "./vite";
import { setupStripeProducts } from "./setupProducts";
import { pool } from "./db";
import { initScheduler } from "./scheduler";
import { applyMigrations } from "./lib/migrationRunner";
import { logger } from "./lib/logger";

(async () => {
  // On Vercel, migrations run during build via `npm run db:migrate`. On
  // local dev / Render we apply on boot so a fresh checkout doesn't need
  // a separate migrate step.
  if (!process.env.VERCEL) {
    await applyMigrations();
  }

  if (!process.env.VERCEL) {
    const { reconcileOrphanCitationRuns } = await import("./lib/citationReconciliation");
    await reconcileOrphanCitationRuns();
  }

  if (process.env.STRIPE_SECRET_KEY) {
    setupStripeProducts().catch((err) => {
      logger.error({ err }, "Stripe product setup failed");
      Sentry.captureException(err, { tags: { source: "stripe-setup" } });
    });
  }

  const server = await prepareApp();

  // Vercel migration: in-process schedulers and the polling content
  // worker have been replaced by:
  //   - One daily Vercel cron firing /api/cron/daily-orchestrator
  //   - Lazy-eval workflow tick on every authenticated request
  //   - Client-driven /api/content-jobs/:jobId/advance
  // These node-cron jobs only run on local dev / Render.
  if (!process.env.VERCEL) {
    initScheduler();
    const { resumeInFlightAutopilots } = await import("./lib/onboardingAutopilot");
    void resumeInFlightAutopilots();
  }

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
  // requests, then end the pg pool, then exit. 10s force-exit timer
  // prevents a hung request from blocking forever.
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
      await Sentry.close(2_000).catch(() => {});
      process.exit(err ? 1 : 0);
    });
  }
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
