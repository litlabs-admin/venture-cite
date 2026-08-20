// Nitro startup plugin - runs the boot side-effects that server/index.ts's
// IIFE runs in dev (orphan-citation-run reconciliation,
// Stripe product setup, the in-process cron scheduler, in-flight autopilot
// resume) exactly once on a long-lived production server process.
//
// WHY THIS EXISTS (Phase 2 Task 7, the highest-value fix in that batch):
// once Nitro's own generated server (dist/server/index.mjs) became the
// real production entry point instead of server/index.ts, Render would
// have silently lost all of the above - no crash, no error, the work
// would just stop happening. src/server/expressBridge.ts calls ONLY
// prepareApp() (route registration), never these side-effects, which is
// correct for Vercel
// (serverless - the daily cron orchestrator covers the equivalents) but
// silently wrong for a long-lived Node host once that host stops booting
// server/index.ts directly.
//
// HOW "RUNS ONCE PER PROCESS" IS GUARANTEED:
// This file is registered via vite.config.ts's `nitro({ plugins: [...] })`
// option. Read directly from node_modules/nitro/dist/_build/common.mjs and
// node_modules/nitro/dist/runtime/internal/app.mjs: every registered
// plugin's default export is invoked exactly once, the first time
// `useNitroApp()` runs, because that function memoizes its instance at
// module scope (`useNitroApp._instance`). The generated node-server preset
// entry (node_modules/nitro/dist/presets/node/runtime/node-server.mjs)
// calls `useNitroApp()` exactly once, synchronously, at module top level,
// before the HTTP listener starts - so this runs once per server process,
// not per request, and cannot double-fire from concurrent requests.
//
// Nitro's plugin loop does NOT await plugin(app) (confirmed by reading the
// generated `initNitroPlugins` template in common.mjs - it's a plain
// synchronous `for` loop with a synchronous try/catch). An async plugin
// function is therefore fully responsible for handling its own errors: an
// unawaited rejection would otherwise become an unhandled promise
// rejection with no guaranteed relationship to Nitro's own error/Sentry
// plumbing. This file's default export stays synchronous and kicks off
// `run()` without awaiting it, but `run()` wraps everything in try/catch
// and logs + reports to Sentry + exits the process on failure itself (see
// below) rather than depending on Nitro or Node's default unhandled-
// rejection behavior to surface the failure.
//
// SKIPPED ON VERCEL: `process.env.VERCEL`, consistent with the existing
// serverless check in server/db.ts:68 (`isServerless = !!process.env.VERCEL`).
// Vercel is serverless (fresh process per invocation). Starting a cron
// scheduler per cold start would be wrong and racy, and
// Nitro's `vercel` preset builds a per-invocation function rather than this
// long-lived node-server entry in the first place, so this file wouldn't
// even be reachable there in practice. The check is still explicit, not
// assumed, per the task's own requirement.
//
// SKIPPED OUTSIDE PRODUCTION so `npm run dev` (server/index.ts,
// NODE_ENV=development, which still runs the identical side-effects
// itself) remains the sole source of them in dev - this guards against
// duplicate execution even if Nitro's own dev-mode SSR pipeline happens to
// instantiate this plugin file while proxying a page request through
// server/vite.ts's vite.middlewares.
import { setupStripeProducts } from "./setupProducts";
import { initScheduler } from "./scheduler";
import { reconcileOrphanCitationRuns } from "./lib/citationReconciliation";
import { resumeInFlightAutopilots } from "./lib/onboardingAutopilot";
import { logger } from "./lib/logger";
import { Sentry } from "./instrument";

let started = false;

/** Accepts the usual spellings so "1"/"yes"/"TRUE" don't silently no-op. */
function isTruthyEnv(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

export default function nitroBoot(): void {
  if (process.env.VERCEL) return;
  if (process.env.NODE_ENV !== "production") return;
  if (started) return; // defence in depth; useNitroApp() already memoizes this
  started = true;

  void run();
}

async function run(): Promise<void> {
  try {
    await reconcileOrphanCitationRuns();

    // The email verification flow assumes the
    // Supabase project-level "Enable email confirmations" toggle is ON.
    // If it's OFF, Supabase auto-confirms every account regardless of
    // the `email_confirm: false` flag we pass to admin.createUser, and
    // our verification gate is silently bypassed. This setting lives in
    // the Supabase Dashboard, not in code - so log a boot-time reminder,
    // same as server/index.ts's dev-mode boot.
    logger.info(
      "Email verification requires Supabase Dashboard → Authentication → Providers → Email → 'Confirm email' to be ON. " +
        "Also configure the project's Site URL (post-confirmation redirect) under Authentication → URL Configuration.",
    );

    if (process.env.STRIPE_SECRET_KEY) {
      setupStripeProducts().catch((err) => {
        logger.error({ err }, "nitroBoot: Stripe product setup failed");
        Sentry.captureException(err, { tags: { source: "nitro-boot-stripe-setup" } });
      });
    }

    // DISABLE_IN_PROCESS_SCHEDULER exists for the "external scheduler" shape.
    //
    // Six jobs are registered BOTH here (node-cron) and in the daily
    // orchestrator endpoint: account-purge, auto-citation, brand-purge,
    // listicle-scan, mention-scan, weekly-report. If an external scheduler
    // calls POST /api/cron/daily-orchestrator while this in-process cron is
    // also live, each of those runs twice - duplicate report emails and
    // duplicate LLM spend. The advisory locks do not help: they stop two
    // runners overlapping, not one firing 15 minutes after the other.
    //
    // On Render's free plan the process sleeps after ~15 minutes idle, which
    // takes this scheduler down with it - so that deployment MUST drive the
    // orchestrator externally and set this flag. See render.yaml.
    //
    // server/lib/jobDebounce.ts is the belt to this braces: it guards the
    // three costly jobs even if both triggers are somehow live at once.
    if (isTruthyEnv(process.env.DISABLE_IN_PROCESS_SCHEDULER)) {
      logger.info(
        "nitroBoot: in-process scheduler DISABLED by DISABLE_IN_PROCESS_SCHEDULER - " +
          "scheduled work must be driven by POST /api/cron/daily-orchestrator",
      );
    } else {
      initScheduler();
    }
    void resumeInFlightAutopilots();

    logger.info(
      {
        scheduler: isTruthyEnv(process.env.DISABLE_IN_PROCESS_SCHEDULER)
          ? "disabled (external)"
          : "in-process",
      },
      "nitroBoot: boot side-effects complete (orphan-citation-run reconciliation, scheduler, autopilot resume)",
    );
  } catch (err) {
    // Loud, not swallowed: this is exactly the failure mode this file
    // exists to prevent from being silent. Log, report to Sentry, flush,
    // then exit - a container orchestrator (Render) restarts a crashed
    // process into a clean retry; a persistent failure shows up as a
    // visible crash loop in the dashboard instead of a server that quietly
    // runs forever with no scheduler or autopilot
    // resume.
    logger.error(
      { err },
      "nitroBoot: boot side-effects FAILED - exiting rather than serving traffic without required startup work",
    );
    Sentry.captureException(err, { tags: { source: "nitro-boot" } });
    await Sentry.close(2_000).catch(() => {});
    process.exit(1);
  }
}
