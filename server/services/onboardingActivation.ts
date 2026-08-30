// Onboarding activation-pipeline business logic, extracted verbatim from
// server/routes/onboarding.ts as part of the B7 service-layer split.
//
// Covers the four endpoints that kick off, retry, drive, and read the
// per-brand activation pipeline (FactSheet kernel -> prompts -> citations):
//   POST /api/onboarding/confirm
//   POST /api/onboarding/autopilot-retry
//   POST /api/onboarding/autopilot-advance/:brandId
//   GET  /api/onboarding/autopilot-status/:brandId
//
// The actual pipeline lives in server/lib/onboardingAutopilot.ts
// (runOnboardingAutopilot); this module only decides WHEN to call it and
// how to shape the result, matching the original inline handler bodies.

import { waitUntil } from "@vercel/functions";
import { logger } from "../lib/logger";
import { storage } from "../storage";
import { withBrandQuota, isUsageLimitError } from "../lib/usageLimit";
import type { Tier } from "../lib/llmPricing";
import { runOnboardingAutopilot } from "../lib/onboardingAutopilot";
import { captureAndFlush } from "../lib/sentryReport";

/** Per-slice budget for a client-driven autopilot advance. Deliberately under
 *  a typical 60s function ceiling with room for the response to flush - the
 *  client simply polls again for the next slice. */
export const AUTOPILOT_SLICE_BUDGET_MS = 40_000;

// ── POST /api/onboarding/confirm ────────────────────────────────────────────

export type ConfirmOnboardingBrandResult =
  { kind: "quota_exceeded"; message: string } | { kind: "confirmed"; brandId: string };

export async function confirmOnboardingBrand(params: {
  userId: string;
  tier: Tier;
  brandName: string;
  website: string;
  brandData: Record<string, unknown>;
  competitors: unknown[];
}): Promise<ConfirmOnboardingBrandResult> {
  const { userId, tier, brandName, website, brandData, competitors } = params;
  const schema = await import("@shared/schema");

  let brand;
  try {
    brand = await withBrandQuota(userId, tier, async (tx) => {
      const [row] = await tx
        .insert(schema.brands)
        .values({
          userId,
          name: brandName,
          companyName:
            typeof brandData.companyName === "string" && brandData.companyName.trim()
              ? brandData.companyName.trim()
              : brandName,
          industry:
            typeof brandData.industry === "string" && brandData.industry.trim()
              ? brandData.industry.trim()
              : "General",
          description: typeof brandData.description === "string" ? brandData.description : null,
          website,
          tone:
            typeof brandData.tone === "string" && brandData.tone.trim()
              ? brandData.tone.trim()
              : "professional",
          targetAudience:
            typeof brandData.targetAudience === "string" ? brandData.targetAudience : null,
          products: Array.isArray(brandData.products) ? brandData.products : [],
          keyValues: Array.isArray(brandData.keyValues) ? brandData.keyValues : [],
          uniqueSellingPoints: Array.isArray(brandData.uniqueSellingPoints)
            ? brandData.uniqueSellingPoints
            : [],
          brandVoice: typeof brandData.brandVoice === "string" ? brandData.brandVoice : null,
          nameVariations: Array.isArray(brandData.nameVariations) ? brandData.nameVariations : [],
          logoUrl: typeof brandData.logoUrl === "string" ? brandData.logoUrl : null,
          autopilotStatus: "pending",
          autopilotStep: 0,
        })
        .returning();
      return row;
    });
  } catch (err) {
    if (isUsageLimitError(err)) {
      return { kind: "quota_exceeded", message: (err as Error).message };
    }
    throw err;
  }

  for (const c of competitors as Array<Record<string, unknown>>) {
    if (!c || typeof c.name !== "string" || !c.name.trim()) continue;
    try {
      await storage.createCompetitor({
        brandId: brand.id,
        name: c.name.trim().slice(0, 200),
        domain: typeof c.domain === "string" ? c.domain.trim().slice(0, 200) : "",
        industry: brand.industry || null,
        description: typeof c.description === "string" ? c.description.slice(0, 500) : null,
        discoveredBy: "manual",
      } as any);
    } catch (err) {
      logger.warn({ err, brandId: brand.id }, "onboarding confirm: competitor insert failed");
    }
  }

  // Kick off the full activation pipeline server-side and return
  // immediately. The autopilot runs the phases IN ORDER -
  // FactSheet kernel (Phase 0) → prompts grounded in that kernel →
  // web-grounded citations - and is resumable: whatever doesn't
  // finish within the deadline is driven to completion by the
  // daily cron (resumeInFlightAutopilots) + the fact-scrape
  // backstop. The fact scrape is no longer client-driven; the
  // redesigned welcome screen just polls /autopilot-status.
  waitUntil(
    runOnboardingAutopilot(brand.id, userId, {
      deadlineMs: Date.now() + 50_000,
    }).catch((err) => {
      captureAndFlush(err, { tags: { source: "onboarding.ts:confirm-kickoff" } });
    }),
  );

  return { kind: "confirmed", brandId: brand.id };
}

// ── POST /api/onboarding/autopilot-retry ────────────────────────────────────

export type RetryOnboardingAutopilotResult = { kind: "not_failed" } | { kind: "retrying" };

export async function retryOnboardingAutopilot(
  brand: { id: string; autopilotStatus?: string | null; autopilotError?: string | null },
  userId: string,
): Promise<RetryOnboardingAutopilotResult> {
  // Atomic compare-and-swap: only transition the row when its
  // current status is still "failed". Two simultaneous retries
  // race here - only one wins; the loser gets 409. This also
  // flips the row to "pending" BEFORE we return 200, so the
  // client's immediate refetch sees the in-progress state
  // instead of the stale "failed" banner.
  const swapped = await storage.transitionAutopilotFromFailedToPending(brand.id);
  if (!swapped) {
    return { kind: "not_failed" };
  }
  logger.info(
    {
      brandId: brand.id,
      userId,
      prevStatus: brand.autopilotStatus,
      prevError: brand.autopilotError,
    },
    "autopilot retry triggered",
  );
  // Use Vercel waitUntil so the retry survives serverless suspension
  // after we respond. Matches the welcome→fact-scrape bridge pattern.
  const deadlineMs = Date.now() + 50_000;
  waitUntil(
    runOnboardingAutopilot(brand.id, userId, { deadlineMs }).catch((err) => {
      captureAndFlush(err, { tags: { source: "onboarding.ts:autopilot-retry" } });
    }),
  );
  return { kind: "retrying" };
}

// ── POST /api/onboarding/autopilot-advance/:brandId ─────────────────────────
//
// The status route below is READ-ONLY, and for a long time it was the only
// thing the client called while a brand was activating. That left the
// pipeline with a kickoff and no client-driven advance: the confirm handler
// starts autopilot with a ~50s budget, and anything that outlasts that
// budget (a fact scrape routinely takes ~2 minutes) parks the brand
// mid-pipeline waiting for a cron tick. Where no cron is actually invoking
// /api/cron/daily-orchestrator, that tick never comes and the brand simply
// stops - fact sheet written, no prompts, no citations, an empty dashboard,
// and a UI cheerfully polling a status that will never change.
//
// Citation runs and perception probes already solve this the other way
// round: the CLIENT drives the run one slice at a time and cron is only a
// backstop for an abandoned tab. This gives autopilot the same shape.
//
// Idempotent and lock-guarded: terminal runs no-op without taking the lock,
// and a busy lock returns current status rather than queueing a second
// slice, so several open tabs cannot repeat paid work.

export type AdvanceOnboardingAutopilotResult =
  | { kind: "not_found" }
  | { kind: "idle"; status: string }
  | {
      kind: "advanced";
      status: string;
      step: number;
      progress: unknown;
      error: string | null;
    };

export async function advanceOnboardingAutopilot(
  brandId: string,
  userId: string,
): Promise<AdvanceOnboardingAutopilotResult> {
  const brand = await storage.getBrandByIdForUser(brandId, userId);
  if (!brand) {
    return { kind: "not_found" };
  }

  const status = brand.autopilotStatus ?? "idle";
  const inFlight =
    status === "pending" ||
    status === "scraping_facts" ||
    status === "generating_prompts" ||
    status === "running_citations";

  // Nothing to do. Cheap path - no lock, no work.
  if (!inFlight) {
    return { kind: "idle", status };
  }

  // No lock here: runOnboardingAutopilot takes the per-brand lock itself,
  // so every entry point is covered and nesting the same key would make
  // this call skip its own inner acquisition.
  await runOnboardingAutopilot(brand.id, userId, {
    deadlineMs: Date.now() + AUTOPILOT_SLICE_BUDGET_MS,
  });

  const after = await storage.getBrandByIdForUser(brand.id, userId);
  return {
    kind: "advanced",
    status: after?.autopilotStatus ?? status,
    step: after?.autopilotStep ?? brand.autopilotStep ?? 0,
    progress: after?.autopilotProgress ?? {},
    error: after?.autopilotError ?? null,
  };
}

// ── GET /api/onboarding/autopilot-status/:brandId ───────────────────────────

export type OnboardingAutopilotStatus = {
  status: string;
  step: number;
  progress: unknown;
  error: string | null;
  startedAt: unknown;
  completedAt: unknown;
};

export async function getOnboardingAutopilotStatus(
  brandId: string,
  userId: string,
): Promise<OnboardingAutopilotStatus | null> {
  const brand = await storage.getBrandByIdForUser(brandId, userId);
  if (!brand) {
    return null;
  }
  return {
    status: brand.autopilotStatus ?? "idle",
    step: brand.autopilotStep ?? 0,
    progress: brand.autopilotProgress ?? {},
    error: brand.autopilotError ?? null,
    startedAt: brand.autopilotStartedAt ?? null,
    completedAt: brand.autopilotCompletedAt ?? null,
  };
}
