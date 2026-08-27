import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "./logger";
import { generateBrandPrompts } from "./promptGenerator";
import { discoverCompetitors } from "./competitorDiscovery";
import { runBrandPrompts } from "../citationChecker";
import { runFullScrapeForBrand } from "./factAgent/v2/runFullScrape";
import { populateBrandDashboard } from "./brandActivation";
import { cronStepBudget } from "./factAgent/v2/vercelBudget";
import type { Brand } from "@shared/schema";

import { captureAndFlush } from "./sentryReport";
import { withDynamicAdvisoryLock, dynamicLockNamespaces } from "./advisoryLock";

/** How many times the recovery sweep will restart a brand that is 'idle' or
 *  'failed' before giving up. Onboarding costs real provider spend, so this is
 *  deliberately small - the goal is to survive a transient 429 or a killed
 *  serverless function, not to grind indefinitely on a brand that is broken
 *  (bad website, permanently revoked API key). At the cap the brand keeps its
 *  'failed' status and the existing manual retry button remains the escape
 *  hatch. Kept in sync with migration 0121, which seeds pre-existing rows here
 *  so they are not swept. */
export const AUTOPILOT_MAX_ATTEMPTS = 5;

/** Wait between retries of a stranded brand. Long enough that a provider quota
 *  window ("429 exceeded your current quota") has a chance to reset before we
 *  spend on another attempt - retrying a quota error immediately just burns
 *  the retry budget against the same wall. */
export const AUTOPILOT_RETRY_BACKOFF_MINUTES = 60;

async function setAutopilot(brandId: string, patch: Partial<Brand>): Promise<void> {
  try {
    await storage.updateBrand(brandId, patch as any);
  } catch (err) {
    logger.warn({ err, brandId, patch }, "onboardingAutopilot: status update failed");
  }
}

/**
 * Drive one brand's activation forward, holding a per-brand lock.
 *
 * Every entry point funnels through here - the onboarding kickoff, the
 * client-driven advance endpoint, the boot resume, and the cron tick - and any
 * two of them can fire at the same moment (a user reopening the dashboard
 * while the minutely tick runs is the ordinary case, not the edge case).
 * Without a lock they run overlapping slices for the same brand and repeat
 * paid work: a second prompt generation, a second citation run across six
 * engines. The lock lives HERE rather than at one call site so no future
 * caller can forget it.
 *
 * A busy lock is a no-op, not a queue: someone else is already driving this
 * brand, and the caller's job is done.
 */
export async function runOnboardingAutopilot(
  brandId: string,
  userId: string,
  options: { deadlineMs?: number } = {},
): Promise<void> {
  const outcome = await withDynamicAdvisoryLock(
    dynamicLockNamespaces.onboardingAutopilotSlice,
    brandId,
    "onboarding-autopilot",
    () => runOnboardingAutopilotUnlocked(brandId, userId, options),
  );
  if (!outcome.ran) {
    logger.info({ brandId }, "onboardingAutopilot: another slice is already running - skipping");
  }
}

async function runOnboardingAutopilotUnlocked(
  brandId: string,
  userId: string,
  options: { deadlineMs?: number } = {},
): Promise<void> {
  try {
    const brand = await storage.getBrandById(brandId);
    if (!brand) {
      logger.warn({ brandId, userId }, "onboardingAutopilot: brand not found");
      return;
    }
    // Vercel migration: autopilot resumes from whichever step the prior
    // call ended on. The "already active" guard previously short-circuited
    // resumes; now we treat 'pending' (kickoff) and 'generating_prompts'
    // as "start fresh from step 1" and 'running_citations' as "resume
    // step 2 only".
    const status = brand.autopilotStatus ?? null;

    logger.info({ brandId, userId, status }, "onboardingAutopilot: starting/resuming");

    // Claim the run BEFORE any work, and before the deadline check below.
    //
    // This used to happen only inside the Phase 0 branch, after two awaits and
    // an early `return` on an exhausted deadline. A kickoff that arrived late,
    // or whose serverless function was killed after the response was already
    // sent (it is launched detached via waitUntil), therefore returned having
    // written NOTHING - leaving the brand at its creation-default 'idle'.
    // 'idle' was not in the recovery sweep's status list, so the brand became
    // permanently invisible to it: never resumed, never retried, dashboard
    // empty forever. That accounted for 24 of 39 brands in production.
    //
    // Writing 'pending' here means the very first thing autopilot does is make
    // itself findable. Every later exit path - deadline, throw, process death
    // - now leaves a row the sweep can see and resume.
    // Only 'idle' (and a null status) needs claiming. A 'failed' run is
    // ALREADY visible to the recovery sweep, and rewriting it to 'pending'
    // discarded the one thing that says how far it got - sending a run that
    // had finished its citations back to the prompt phase.
    if (status === null || status === "idle") {
      await setAutopilot(brandId, {
        autopilotStatus: "pending",
        autopilotStartedAt: new Date(),
        autopilotError: null,
      } as never);
    }
    await storage.markAutopilotAttempt(brandId);

    // Phase 0: the FactSheet kernel must exist BEFORE prompt generation
    // so prompts are grounded in real, verified facts (industry, ICP,
    // products, positioning) rather than the thin confirm-form row the
    // user just typed. This is the correct activation order:
    //   Capture → Discover facts → Frame prompts → Measure citations.
    // Resumable: if the scrape doesn't finish within the deadline the
    // brand stays in 'scraping_facts'; the daily cron
    // (resume-in-flight-autopilots) plus the fact-scrape-backstop drive
    // the run to completion, and the next autopilot resume re-checks
    // here and advances. 'generating_prompts'/'running_citations' mean a
    // prior invocation already cleared Phase 0 - skip it.
    if (status !== "generating_prompts" && status !== "running_citations") {
      const factSheetReady = await storage.getLastCompletedScrapeRunAt(brandId);
      if (!factSheetReady) {
        if (options.deadlineMs !== undefined && Date.now() > options.deadlineMs) return;

        await setAutopilot(brandId, {
          autopilotStatus: "scraping_facts",
          autopilotStep: 0,
          autopilotStartedAt: new Date(),
          autopilotError: null,
          autopilotProgress: {},
        } as never);

        await runFullScrapeForBrand(
          {
            id: brand.id,
            name: brand.name,
            website: brand.website,
            industry: brand.industry,
            description: brand.description,
            products: Array.isArray(brand.products) ? (brand.products as string[]) : [],
            targetAudience: brand.targetAudience,
            uniqueSellingPoints: Array.isArray(brand.uniqueSellingPoints)
              ? (brand.uniqueSellingPoints as string[])
              : [],
            keyValues: Array.isArray(brand.keyValues)
              ? (brand.keyValues as string[]).join(", ")
              : ((brand.keyValues as string | null) ?? null),
            brandVoice: brand.brandVoice,
            tone: brand.tone,
          },
          // Inherit Vercel-tier budget. Pro ≈ 46s; Hobby ≈ 7s. If a
          // deadline was passed in, trust the caller's tighter bound.
          options.deadlineMs ?? Date.now() + cronStepBudget(0.8),
          // Must be one of the brand_fact_scrape_runs_triggered_by_check
          // values (migration 0062); "onboarding" is the canonical
          // first-run origin.
          "onboarding",
        );

        // Re-check: only advance to prompts once the run actually
        // reached a completed terminal state. If not (deadline cut it
        // short, or a concurrent scrape holds the brand lock) stay in
        // 'scraping_facts' and let the cron finish it.
        const nowReady = await storage.getLastCompletedScrapeRunAt(brandId);
        if (!nowReady) {
          logger.info(
            { brandId, userId },
            "onboardingAutopilot: fact sheet not complete yet - will resume next cron tick",
          );
          return;
        }
      }
    }

    if (status !== "running_citations") {
      // Step 1: prompt generation. One-shot LLM call that takes ~5-15s.
      // If the deadline is already exhausted before this call, skip and
      // let the next /advance pick up.
      if (options.deadlineMs !== undefined && Date.now() > options.deadlineMs) return;

      await setAutopilot(brandId, {
        autopilotStatus: "generating_prompts",
        autopilotStep: 1,
        autopilotStartedAt: new Date(),
        autopilotError: null,
        autopilotProgress: {},
      } as never);

      // Discover competitors BEFORE prompt generation so the first prompt set
      // can build grounded "alternatives to <competitor>" comparison questions
      // (that's where citations happen). Best-effort - never block onboarding.
      try {
        await discoverCompetitors(brandId);
      } catch (err) {
        logger.warn(
          { err, brandId },
          "onboardingAutopilot: competitor discovery failed (non-fatal)",
        );
      }

      // Re-read: the Phase 0 scrape above writes corrected industry /
      // description / audience back onto the brands row, and `brand` was
      // fetched before that. Without this the prompts are generated
      // against the pre-correction profile - the exact thing the
      // write-back exists to prevent.
      const freshBrand = (await storage.getBrandById(brandId)) ?? brand;

      // Already generated on a previous slice? Skip, do not regenerate.
      //
      // Without this, any resume that re-entered this phase called
      // generateBrandPrompts against a brand that already had its set. The
      // generator dedupes, so it saved 0 and this threw "produced no prompts"
      // - marking a brand FAILED for the sin of already being done. The sweep
      // then retried it, failed the same way, and burned the whole retry
      // budget. Observed exactly that on a real brand whose citation run had
      // already succeeded with all 60 rankings written.
      //
      // Same shape as the Phase 0 guard above, which skips the scrape when a
      // completed scrape run already exists.
      const existingTracked = await storage.getBrandPromptsByBrandId(brandId, {
        status: "tracked",
      });
      // Hoisted: the citation phase below reports this count either way.
      let promptsGenerated = existingTracked.length;
      if (existingTracked.length > 0) {
        logger.info(
          { brandId, existing: existingTracked.length },
          "onboardingAutopilot: prompts already generated - skipping generation",
        );
      } else {
        const result = await generateBrandPrompts(freshBrand);
        promptsGenerated = result.saved.length;
        if (promptsGenerated === 0) {
          throw new Error(result.error || "Prompt generation produced no prompts");
        }

        await setAutopilot(brandId, {
          autopilotProgress: { promptsGenerated },
        } as never);
      }

      await setAutopilot(brandId, {
        autopilotStatus: "running_citations",
        autopilotStep: 2,
        autopilotProgress: { promptsGenerated, citationsRun: 0, citationsTotal: 0 },
      } as never);
    }

    // Step 2: citation run. Slice-aware so we honour the deadline; if
    // not done within budget, the brand stays in 'running_citations'
    // and the next /advance call (or cron drain) resumes via the
    // citation_runs table's existing-rankings filter.
    if (options.deadlineMs !== undefined && Date.now() > options.deadlineMs) return;

    // Resume an in-flight run rather than starting a second one.
    //
    // citation_runs carries a partial unique index allowing ONE active run per
    // brand. runBrandPrompts always inserts a new run, so once a slice ended
    // with a run still 'running' - which is the normal outcome of a budgeted
    // slice - every subsequent resume hit a unique violation and marked the
    // brand FAILED. Observed on a real brand: one 'succeeded' run, one stuck
    // 'running', and an insert error as the autopilot_error. The bug was
    // invisible while nothing resumed frequently; making activation actually
    // run in the background is what surfaced it.
    const activeRuns = await storage.getActiveCitationRuns(brandId);
    if (activeRuns.length > 0) {
      const { advanceCitationRun } = await import("../citationChecker");
      const runId = activeRuns[0].id;
      logger.info({ brandId, runId }, "onboardingAutopilot: advancing existing citation run");
      const slice = await advanceCitationRun(
        runId,
        options.deadlineMs ?? Date.now() + cronStepBudget(0.8),
      );
      // Not finished within this slice - stay in 'running_citations' and let
      // the next tick continue. Nothing to fail here.
      if (!slice?.done) return;
    }

    const citationResult = await runBrandPrompts(brandId, undefined, {
      triggeredBy: "auto_onboarding",
      deadlineMs: options.deadlineMs,
      // Resume mode is safe to set unconditionally - for a fresh
      // citation run there are no existing rankings to skip.
      resume: true,
      onProgress: async (checked, total) => {
        try {
          await db.execute(sql`
            UPDATE brands
            SET autopilot_progress = COALESCE(autopilot_progress, '{}'::jsonb) || ${JSON.stringify({
              citationsRun: checked,
              citationsTotal: total,
            })}::jsonb
            WHERE id = ${brandId}
          `);
        } catch (err) {
          logger.warn({ err, brandId }, "onboardingAutopilot: progress write failed");
        }
      },
    });

    if (!citationResult.done) {
      logger.info(
        { brandId, userId },
        "onboardingAutopilot: citation slice incomplete - will resume next cron tick",
      );
      return;
    }

    // Step 3: everything the citation run does not populate - site health,
    // mention scan, listicle scan, perception scoring. Without this the
    // dashboard's Mentions, Listicles and Perception panels render dashes on
    // a brand-new brand until the next weekly sweep, and Perception forever,
    // since its only other trigger is a button on a different page.
    //
    // Runs LAST and deliberately does not gate completion: these are
    // supplementary panels, and the citation data that makes the dashboard
    // useful has already landed by this point. Whatever the deadline cuts
    // short is picked up by the weekly sweep, which reads the same per-brand
    // ledger this call writes - so nothing re-runs and nothing is skipped.
    // populateBrandDashboard never throws.
    //
    // Given its OWN budget rather than `options.deadlineMs`. By the time the
    // fact scrape, prompt generation and citation run have all completed, the
    // caller's 50s is normally spent - so inheriting it meant every producer
    // here skipped, on every onboarding, and the new brand's Mentions,
    // Listicles and Perception panels stayed empty until the next hourly
    // sweep. That is the exact failure this phase exists to fix.
    //
    // Safe because this whole call is already detached from the HTTP response
    // (routes/onboarding.ts wraps it in waitUntil, which is a no-op shim off
    // Vercel - on the Render node-server target the promise simply runs on).
    // The budget is a courtesy bound on one brand's activation, not a platform
    // deadline; anything it cuts short the weekly sweep finishes, because both
    // read the same ledger.
    await populateBrandDashboard(brandId, { deadlineMs: Date.now() + 120_000 });

    await setAutopilot(brandId, {
      autopilotStatus: "completed",
      autopilotStep: 3,
      autopilotCompletedAt: new Date(),
    } as never);

    logger.info({ brandId, userId }, "onboardingAutopilot: complete");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, brandId, userId }, "onboardingAutopilot: failed");
    captureAndFlush(err, { tags: { source: "onboarding-autopilot" } });
    await setAutopilot(brandId, {
      autopilotStatus: "failed",
      autopilotError: message.slice(0, 1000),
    } as never);
  }
}

// Resume any autopilots that were in-flight when the prior process
// stopped. Locally this fires on boot via setImmediate (best-effort,
// fire-and-forget). On Vercel it's invoked from the daily cron with a
// deadline so the function returns before the platform timeout - the
// next cron tick picks up whichever autopilots didn't finish today.
export async function resumeInFlightAutopilots(deadlineMs?: number): Promise<void> {
  try {
    // In-flight states resume unconditionally: they are mid-pipeline and the
    // work is already paid for.
    //
    // 'idle' and 'failed' are ALSO swept now, but bounded. They were excluded
    // before, which is why a brand whose kickoff never landed, or which hit a
    // transient provider 429, stayed dead forever with an empty dashboard.
    // They are gated on an attempt cap and a backoff because unlike the
    // in-flight states, retrying these re-runs work that costs real provider
    // spend - so a genuinely broken brand has to stop trying.
    //
    // Migration 0121 seeded pre-existing brands at the cap, so this does not
    // stampede historical strandings on first deploy.
    const rows = await db.execute<{ id: string; user_id: string | null }>(sql`
      SELECT id, user_id FROM brands
      WHERE deleted_at IS NULL
        AND (
          autopilot_status IN ('pending', 'scraping_facts', 'generating_prompts', 'running_citations')
          OR (
            autopilot_status IN ('idle', 'failed')
            AND autopilot_attempts < ${AUTOPILOT_MAX_ATTEMPTS}
            AND (
              autopilot_last_attempt_at IS NULL
              OR autopilot_last_attempt_at < now() - ${sql.raw(`interval '${AUTOPILOT_RETRY_BACKOFF_MINUTES} minutes'`)}
            )
          )
        )
    `);
    const list = (rows as { rows?: Array<{ id: string; user_id: string | null }> }).rows ?? [];
    let resumedCount = 0;
    for (const row of list) {
      if (!row.user_id) continue;
      if (deadlineMs !== undefined && Date.now() > deadlineMs) {
        logger.info(
          { resumedSoFar: resumedCount, total: list.length },
          "onboardingAutopilot: resume deadline hit - remainder deferred",
        );
        break;
      }
      const { id, user_id } = row;
      resumedCount += 1;
      if (deadlineMs !== undefined) {
        // Cron path: drive autopilot inline so we know it actually ran
        // before the function terminates.
        try {
          await runOnboardingAutopilot(id, user_id, { deadlineMs });
        } catch (err) {
          logger.warn({ err, brandId: id }, "onboardingAutopilot: inline resume failed");
        }
      } else {
        // Local boot path: detach so boot stays fast.
        setImmediate(() => {
          void runOnboardingAutopilot(id, user_id);
        });
      }
    }
    logger.info({ resumedCount }, "onboardingAutopilot: resumed in-flight runs");
  } catch (err) {
    logger.error({ err }, "onboardingAutopilot: resume scan failed");
    captureAndFlush(err, { tags: { source: "onboarding-autopilot-resume" } });
  }
}
