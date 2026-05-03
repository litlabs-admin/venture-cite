// Local dev entry point (`npm run dev` / `npm start`).
//
// Vercel uses server/vercelEntry.ts instead — this file never runs on
// Vercel. Boot side-effects (migrations, scheduler, autopilot resume)
// only run here; on Vercel the daily cron orchestrator handles the
// equivalents.

import { app, prepareApp } from "./app";
import { Sentry } from "./instrument";
import { setupVite, serveStatic, log } from "./vite";
import { setupStripeProducts } from "./setupProducts";
import { pool } from "./db";
import { initScheduler } from "./scheduler";
import { applyMigrations } from "./lib/migrationRunner";
import { reconcileOrphanCitationRuns } from "./lib/citationReconciliation";
import { resumeInFlightAutopilots } from "./lib/onboardingAutopilot";
import { logger } from "./lib/logger";

(async () => {
  await applyMigrations();
  await reconcileOrphanCitationRuns();

  if (process.env.STRIPE_SECRET_KEY) {
    setupStripeProducts().catch((err) => {
      logger.error({ err }, "Stripe product setup failed");
      Sentry.captureException(err, { tags: { source: "stripe-setup" } });
    });
  }

  const server = await prepareApp();

  initScheduler();
  void resumeInFlightAutopilots();

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
