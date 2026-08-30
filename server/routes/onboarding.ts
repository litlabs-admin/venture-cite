// Server-side onboarding state.
//
// Single endpoint that merges keys into users.onboarding_state. The
// allowlist below defines the only fields that the client can write -
// arbitrary keys are silently dropped. Add new flags here as we
// introduce them; that keeps the column from accumulating dead /
// abusive data.
//
// Backs the SidebarOnboarding component, which reads/writes these
// flags to drive the checklist state.

import type { Express, Response } from "express";
import { resolveTier } from "@shared/schema";
import { logger } from "../lib/logger";
import { validateDomain } from "@shared/validateDomain";
import { requireUser, requireBrand, OwnershipError } from "../lib/ownership";
import { aiLimitMiddleware, sendError, asyncHandler } from "../lib/routesShared";
import type { Tier } from "../lib/llmPricing";
import { applyOnboardingStatePatch } from "../services/onboardingState";
import { runOnboardingBrandScrape, type ScrapeEvent } from "../services/onboardingScrape";
import {
  confirmOnboardingBrand,
  retryOnboardingAutopilot,
  advanceOnboardingAutopilot,
  getOnboardingAutopilotStatus,
} from "../services/onboardingActivation";

import { captureAndFlush } from "../lib/sentryReport";

export function setupOnboardingRoutes(app: Express) {
  app.patch(
    "/api/onboarding/state",
    asyncHandler(async (req, res) => {
      try {
        const user = (req as unknown as { user?: { id: string } }).user;
        if (!user) {
          return res.status(401).json({ success: false, error: "Not authenticated" });
        }

        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return res.status(400).json({ success: false, error: "Body must be a JSON object." });
        }

        const result = await applyOnboardingStatePatch(user.id, body as Record<string, unknown>);
        if (result.kind === "no_fields") {
          return res.status(400).json({
            success: false,
            error: "No recognized onboarding fields in body.",
            allowedFields: result.allowedFields,
          });
        }

        res.json({ success: true, onboardingState: result.onboardingState });
      } catch (err) {
        logger.error({ err }, "onboarding state update failed");
        captureAndFlush(err, { tags: { source: "onboarding-state" } });
        res.status(500).json({ success: false, error: "Failed to save onboarding state." });
      }
    }),
  );

  const activeScrapes = new Map<string, true>();

  function sseWrite(res: Response, event: ScrapeEvent): void {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      logger.warn({ err }, "onboarding scrape: SSE write failed");
    }
  }

  app.post(
    "/api/onboarding/scrape-stream",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      const user = (req as unknown as { user?: { id: string } }).user;
      if (!user) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }

      const rawDomain = typeof req.body?.domain === "string" ? req.body.domain : "";
      const validation = validateDomain(rawDomain);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      if (!validation.valid) {
        sseWrite(res, { type: "error", reason: validation.reason });
        res.end();
        return;
      }

      if (activeScrapes.has(user.id)) {
        sseWrite(res, { type: "error", reason: "A scrape is already in progress" });
        res.end();
        return;
      }
      activeScrapes.set(user.id, true);

      const domain = validation.normalized;
      const homepageUrl = `https://${domain}`;

      try {
        const outcome = await runOnboardingBrandScrape(domain, homepageUrl, (event) =>
          sseWrite(res, event),
        );

        if (outcome.kind === "llm_failed") {
          sseWrite(res, {
            type: "error",
            reason:
              "We could not finish reading your site. This is usually temporary - please try again.",
          });
          sseWrite(res, { type: "end" });
          res.end();
          return;
        }
        if (outcome.kind === "unreachable") {
          sseWrite(res, {
            type: "error",
            reason: `We could not reach ${outcome.domain}. Check the address is right and the site is online.`,
          });
          sseWrite(res, { type: "end" });
          res.end();
          return;
        }

        sseWrite(res, { type: "result", data: outcome.data });
        sseWrite(res, { type: "end" });
        res.end();
      } catch (err) {
        logger.error({ err, domain }, "onboarding scrape stream failed");
        captureAndFlush(err, { tags: { source: "onboarding-scrape" } });
        sseWrite(res, { type: "error", reason: "Scrape failed" });
        res.end();
      } finally {
        activeScrapes.delete(user.id);
      }
    }),
  );

  app.post(
    "/api/onboarding/confirm",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = req.body ?? {};
        const brandData = body.brandData ?? {};
        const competitors = Array.isArray(body.competitors) ? body.competitors : [];

        const brandName = typeof brandData.brandName === "string" ? brandData.brandName.trim() : "";
        const website = typeof brandData.website === "string" ? brandData.website.trim() : "";
        if (!brandName) {
          return res.status(400).json({ success: false, error: "brandName is required" });
        }
        if (!website) {
          return res.status(400).json({ success: false, error: "website is required" });
        }

        const tier = resolveTier(user) as Tier;

        const result = await confirmOnboardingBrand({
          userId: user.id,
          tier,
          brandName,
          website,
          brandData,
          competitors,
        });

        if (result.kind === "quota_exceeded") {
          return res
            .status(403)
            .json({ success: false, error: result.message, limitReached: true });
        }

        res.json({ success: true, brandId: result.brandId });
      } catch (err) {
        sendError(res, err, "Failed to confirm onboarding");
      }
    }),
  );

  app.post(
    "/api/onboarding/autopilot-retry",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId } = (req.body ?? {}) as { brandId?: unknown };
        if (typeof brandId !== "string" || brandId.length === 0) {
          return res.status(400).json({ success: false, error: "brandId required" });
        }
        // Ownership check first (404 anti-enumeration on miss).
        const brand = await requireBrand(brandId, user.id);
        const result = await retryOnboardingAutopilot(brand, user.id);
        if (result.kind === "not_failed") {
          return res
            .status(409)
            .json({ success: false, error: "Autopilot is not in a failed state" });
        }
        return res.json({ success: true });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        return sendError(res, err, "Failed to retry autopilot");
      }
    }),
  );

  app.post(
    "/api/onboarding/autopilot-advance/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const result = await advanceOnboardingAutopilot(req.params.brandId, user.id);

        if (result.kind === "not_found") {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        if (result.kind === "idle") {
          return res.json({ success: true, data: { status: result.status, advanced: false } });
        }

        res.json({
          success: true,
          data: {
            status: result.status,
            step: result.step,
            progress: result.progress,
            error: result.error,
            advanced: true,
          },
        });
      } catch (err) {
        sendError(res, err, "Failed to advance activation");
      }
    }),
  );

  app.get(
    "/api/onboarding/autopilot-status/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const status = await getOnboardingAutopilotStatus(req.params.brandId, user.id);
        if (!status) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        res.json({ success: true, data: status });
      } catch (err) {
        sendError(res, err, "Failed to fetch autopilot status");
      }
    }),
  );
}
