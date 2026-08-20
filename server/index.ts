// Local dev entry point (`npm run dev` ONLY).
//
// Phase 2 Task 7: this file is no longer the production entry point on any
// host. Production (`npm start`) now runs Nitro's own generated server
// (dist/server/index.mjs) directly on BOTH hosts - Vercel via Nitro's vercel
// preset, which supersedes the hand-written server/vercelEntry.ts + api/
// entry that used to serve it (both deleted in this task).
// Boot side-effects (scheduler, autopilot resume, Stripe setup) run here
// in development, AND separately in production via the
// Nitro startup plugin at server/nitroBoot.ts (registered in
// vite.config.ts's nitro({ plugins: [...] })) - the plugin no-ops unless
// NODE_ENV=production, so the two never double-run. On Vercel the daily
// cron orchestrator handles the equivalents, same as always.

import { app, prepareApp } from "./app";
import { Sentry } from "./instrument";
import { setupVite, log } from "./vite";
import { setupStripeProducts } from "./setupProducts";
import { pool } from "./db";
import { initScheduler } from "./scheduler";
import { reconcileOrphanCitationRuns } from "./lib/citationReconciliation";
import { resumeInFlightAutopilots } from "./lib/onboardingAutopilot";
import { logger } from "./lib/logger";

(async () => {
  await reconcileOrphanCitationRuns();

  // The email verification flow assumes the
  // Supabase project-level "Enable email confirmations" toggle is ON.
  // If it's OFF, Supabase auto-confirms every account regardless of
  // the `email_confirm: false` flag we pass to admin.createUser, and
  // our verification gate is silently bypassed. This setting lives in
  // the Supabase Dashboard, not in code - so log a boot-time reminder
  // and document it in .env.example.
  logger.info(
    "Email verification requires Supabase Dashboard → Authentication → Providers → Email → 'Confirm email' to be ON. " +
      "Also configure the project's Site URL (post-confirmation redirect) under Authentication → URL Configuration.",
  );

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
    // server/index.ts is the LOCAL DEV entry point only (see top-of-file
    // comment) - production runs Nitro's generated server instead. Throw
    // loudly rather than silently serving nothing (serveStatic()/dist/public
    // were removed in Phase 2 Task 7) if this file is ever run with
    // NODE_ENV=production by mistake.
    throw new Error(
      "server/index.ts must not run with NODE_ENV=production. " +
        "Production runs `node dist/server/index.mjs` (npm start) instead.",
    );
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
    log(`${signal} received - shutting down`);
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
