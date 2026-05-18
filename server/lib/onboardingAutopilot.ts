import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "./logger";
import { generateBrandPrompts } from "./promptGenerator";
import { runBrandPrompts } from "../citationChecker";
import { runFullScrapeForBrand } from "./factAgent/v2/runFullScrape";
import type { Brand } from "@shared/schema";

import { captureAndFlush } from "./sentryReport";
const ACTIVE_STATUSES = new Set(["generating_prompts", "running_citations"]);

async function setAutopilot(brandId: string, patch: Partial<Brand>): Promise<void> {
  try {
    await storage.updateBrand(brandId, patch as any);
  } catch (err) {
    logger.warn({ err, brandId, patch }, "onboardingAutopilot: status update failed");
  }
}

export async function runOnboardingAutopilot(
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
    // prior invocation already cleared Phase 0 — skip it.
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
          options.deadlineMs ?? Date.now() + 45_000,
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
            "onboardingAutopilot: fact sheet not complete yet — will resume next cron tick",
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

      const result = await generateBrandPrompts(brand);
      const promptsGenerated = result.saved.length;
      if (promptsGenerated === 0) {
        throw new Error(result.error || "Prompt generation produced no prompts");
      }

      await setAutopilot(brandId, {
        autopilotProgress: { promptsGenerated },
      } as never);

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

    const citationResult = await runBrandPrompts(brandId, undefined, {
      triggeredBy: "auto_onboarding",
      deadlineMs: options.deadlineMs,
      // Resume mode is safe to set unconditionally — for a fresh
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
        "onboardingAutopilot: citation slice incomplete — will resume next cron tick",
      );
      return;
    }

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
// deadline so the function returns before the platform timeout — the
// next cron tick picks up whichever autopilots didn't finish today.
export async function resumeInFlightAutopilots(deadlineMs?: number): Promise<void> {
  try {
    const rows = await db.execute<{ id: string; user_id: string | null }>(sql`
      SELECT id, user_id FROM brands
      WHERE autopilot_status IN ('pending', 'scraping_facts', 'generating_prompts', 'running_citations')
        AND deleted_at IS NULL
    `);
    const list = (rows as { rows?: Array<{ id: string; user_id: string | null }> }).rows ?? [];
    let resumedCount = 0;
    for (const row of list) {
      if (!row.user_id) continue;
      if (deadlineMs !== undefined && Date.now() > deadlineMs) {
        logger.info(
          { resumedSoFar: resumedCount, total: list.length },
          "onboardingAutopilot: resume deadline hit — remainder deferred",
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
