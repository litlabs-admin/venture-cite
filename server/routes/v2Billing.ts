// Usage meters for /v2/settings/billing.
//
// The subscription itself (plan name, price, renewal date, cancellation) and
// invoices already have real, working endpoints - /api/billing/subscription,
// /api/billing/invoices, /api/billing/portal-session, /api/billing/cancel,
// /api/billing/resume, /api/stripe/products, /api/stripe/checkout (all in
// server/routes/billing.ts and server/services/billing.ts, which this file
// does not touch). What is missing is USAGE: brands, tracked questions,
// citation runs, and content generated. Those numbers are not Stripe's to
// know, so they are computed here from this brand's own rows.

import type { Express } from "express";
import { and, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { brandPrompts, citationRuns, resolveTier, usageLimits } from "@shared/schema";
import { TRACKED_PROMPTS_CAP } from "@shared/constants";
import { requireBrand, requireUser } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";

// Citation runs have no plan cap in the schema (only tracked questions and
// article generation do) - so "usage this period" for them is a trailing
// window, not a fraction of a limit that does not exist.
const CITATION_RUN_WINDOW_DAYS = 30;

export function setupV2BillingRoutes(app: Express): void {
  // GET /api/v2/billing/:brandId/usage
  app.get(
    "/api/v2/billing/:brandId/usage",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const [fullUser, brands, trackedPrompts, periodStart] = await Promise.all([
          storage.getUser(user.id),
          storage.getBrandsByUserId(user.id),
          db
            .select({ id: brandPrompts.id })
            .from(brandPrompts)
            .where(and(eq(brandPrompts.brandId, brand.id), eq(brandPrompts.status, "tracked"))),
          Promise.resolve(new Date(Date.now() - CITATION_RUN_WINDOW_DAYS * 24 * 60 * 60 * 1000)),
        ]);
        if (!fullUser) {
          return res.status(404).json({ success: false, error: "User not found" });
        }

        const citationRunRows = await db
          .select({ id: citationRuns.id })
          .from(citationRuns)
          .where(and(eq(citationRuns.brandId, brand.id), gte(citationRuns.startedAt, periodStart)));

        const tier = resolveTier(fullUser);
        const limits = usageLimits[tier];

        res.json({
          success: true,
          data: {
            tier,
            brandsUsed: brands.length,
            brandsLimit: limits.maxBrands,
            trackedQuestionsUsed: trackedPrompts.length,
            trackedQuestionsCap: TRACKED_PROMPTS_CAP,
            citationRunsThisPeriod: citationRunRows.length,
            periodDays: CITATION_RUN_WINDOW_DAYS,
            contentGeneratedUsed: fullUser.articlesUsedThisMonth,
            contentGeneratedLimit: limits.articlesPerMonth,
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load billing usage");
      }
    }),
  );
}
