import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "./logger";
import { Sentry } from "../instrument";
import { generateBrandPrompts } from "./promptGenerator";
import { runBrandPrompts } from "../citationChecker";
import type { Brand } from "@shared/schema";

const ACTIVE_STATUSES = new Set(["generating_prompts", "running_citations"]);

async function setAutopilot(brandId: string, patch: Partial<Brand>): Promise<void> {
  try {
    await storage.updateBrand(brandId, patch as any);
  } catch (err) {
    logger.warn({ err, brandId, patch }, "onboardingAutopilot: status update failed");
  }
}

export async function runOnboardingAutopilot(brandId: string, userId: string): Promise<void> {
  try {
    const brand = await storage.getBrandById(brandId);
    if (!brand) {
      logger.warn({ brandId, userId }, "onboardingAutopilot: brand not found");
      return;
    }
    if (brand.autopilotStatus && ACTIVE_STATUSES.has(brand.autopilotStatus)) {
      logger.info(
        { brandId, status: brand.autopilotStatus },
        "onboardingAutopilot: already active, skipping",
      );
      return;
    }

    logger.info({ brandId, userId }, "onboardingAutopilot: starting");

    await setAutopilot(brandId, {
      autopilotStatus: "generating_prompts",
      autopilotStep: 1,
      autopilotStartedAt: new Date(),
      autopilotError: null,
      autopilotProgress: {},
    } as any);

    const result = await generateBrandPrompts(brand);
    const promptsGenerated = result.saved.length;
    if (promptsGenerated === 0) {
      throw new Error(result.error || "Prompt generation produced no prompts");
    }

    await setAutopilot(brandId, {
      autopilotProgress: { promptsGenerated },
    } as any);

    await setAutopilot(brandId, {
      autopilotStatus: "running_citations",
      autopilotStep: 2,
      autopilotProgress: { promptsGenerated, citationsRun: 0, citationsTotal: 0 },
    } as any);

    await runBrandPrompts(brandId, undefined, {
      triggeredBy: "auto_onboarding",
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

    await setAutopilot(brandId, {
      autopilotStatus: "completed",
      autopilotStep: 3,
      autopilotCompletedAt: new Date(),
    } as any);

    logger.info({ brandId, userId, promptsGenerated }, "onboardingAutopilot: complete");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, brandId, userId }, "onboardingAutopilot: failed");
    Sentry.captureException(err, { tags: { source: "onboarding-autopilot" } });
    await setAutopilot(brandId, {
      autopilotStatus: "failed",
      autopilotError: message.slice(0, 1000),
    } as any);
  }
}

export async function resumeInFlightAutopilots(): Promise<void> {
  try {
    const rows = await db.execute<{ id: string; user_id: string | null }>(sql`
      SELECT id, user_id FROM brands
      WHERE autopilot_status IN ('pending', 'generating_prompts', 'running_citations')
        AND deleted_at IS NULL
    `);
    const list = (rows as any).rows as Array<{ id: string; user_id: string | null }>;
    let resumedCount = 0;
    for (const row of list) {
      if (!row.user_id) continue;
      const { id, user_id } = row;
      resumedCount += 1;
      setImmediate(() => {
        void runOnboardingAutopilot(id, user_id);
      });
    }
    logger.info({ resumedCount }, "onboardingAutopilot: resumed in-flight runs");
  } catch (err) {
    logger.error({ err }, "onboardingAutopilot: resume scan failed");
    Sentry.captureException(err, { tags: { source: "onboarding-autopilot-resume" } });
  }
}
