// Brand CRUD routes.
//
// Extracted from server/routes.ts as part of the per-domain split.
// The original monolith now only mounts this module via setupBrandRoutes.
//
// Includes:
//   POST /api/brands/create-from-website - LLM-fill brand fields from website and persist
//   GET  /api/brands                    - list user's (non-soft-deleted)
//   GET  /api/brands/:id                - single brand
//   POST /api/brands                    - manual create
//   PUT  /api/brands/:id                - update with optional optimistic lock
//   DELETE /api/brands/:id              - soft-delete with 30-day grace

import type { Express } from "express";
import { z } from "zod";
import { insertBrandSchema, usageLimits, resolveTier } from "@shared/schema";
import { MODELS } from "../lib/modelConfig";
import { safeFetchText } from "../lib/ssrf";
import { extractPageContent } from "../lib/pageText";
import { requireUser } from "../lib/ownership";
import { createRequestActor } from "../lib/requestActor";
import { requestData } from "../data/requestData";
import { RequestBrandQuotaError } from "../data/requestBrandRepository";
import { logAudit } from "../lib/audit";
import { aiLimitMiddleware, sendError, asyncHandler } from "../lib/routesShared";
import { getOpenrouterClient } from "../lib/factAgent/v2/openrouterClient";
import {
  BRAND_PROFILE_SYSTEM_PROMPT,
  brandProfileSchema,
  parseBrandProfile,
  type BrandProfile,
} from "../lib/brandProfilePrompt";

import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { waitUntil } from "@vercel/functions";
export function setupBrandRoutes(app: Express): void {
  app.get(
    "/api/brands",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const brands = await requestData.forActor(actor).brands.list();
        res.json({ success: true, data: brands });
      } catch (error) {
        sendError(res, error, "Failed to fetch brands");
      }
    }),
  );

  app.get(
    "/api/brands/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const brand = await requestData.forActor(actor).brands.get(req.params.id);
        if (!brand) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        res.json({ success: true, data: brand });
      } catch (error) {
        sendError(res, error, "Failed to fetch brand");
      }
    }),
  );

  app.post(
    "/api/brands/create-from-website",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brands = requestData.forActor(createRequestActor(user.id)).brands;

        // A cheap pre-check gives fast feedback. The authoritative check
        // happens inside the actor-bound repository while it holds the user lock.
        const tier = resolveTier(user);
        const tierLimit = (usageLimits[tier] || usageLimits.free).maxBrands;
        if (tierLimit !== -1) {
          const existingBrands = await brands.list();
          if (existingBrands.length >= tierLimit) {
            return res.status(403).json({
              success: false,
              error: `Brand limit reached - your ${tier} plan allows ${tierLimit}. Delete an existing brand or upgrade for more.`,
              limitReached: true,
            });
          }
        }

        const bodySchema = z.object({ url: z.string().min(1, "Please enter a website URL") });
        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "Please enter a website URL" });
        }

        let { url } = parsed.data;
        url = url.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }

        try {
          const parsedUrl = new URL(url);
          if (!parsedUrl.hostname.includes(".")) {
            return res.status(400).json({
              success: false,
              error: "Please enter a valid URL (e.g., https://yoursite.com)",
            });
          }
        } catch {
          return res.status(400).json({
            success: false,
            error: "Please enter a valid URL (e.g., https://yoursite.com)",
          });
        }

        const analysisClient = getOpenrouterClient();
        if (!analysisClient) {
          return res.status(503).json({ success: false, error: "AI service is not configured" });
        }

        // Three outcomes, kept distinct. `pageContent` is what the model
        // reads; `fetchFailed` means we never got the page at all.
        //
        // The two "Please analyze based on the URL/domain name alone."
        // strings that used to live here are gone. They told the model to
        // invent a profile from a hostname, which is the same
        // hallucination generator that was deliberately removed from the
        // onboarding scrape (see routes/onboarding.ts). It also made this
        // endpoint non-deterministic on any site with no readable text: at
        // temperature 0.3 the model sometimes obeyed the prompt's grounding
        // rule and returned {}, and sometimes guessed - so the same domain
        // "worked" on one attempt and came back blank on the next.
        let pageContent = "";
        let fetchFailed = false;
        try {
          const { status, text, contentType } = await safeFetchText(url, {
            maxBytes: 2 * 1024 * 1024,
            timeoutMs: 10_000,
          });
          if (status < 200 || status >= 400) {
            fetchFailed = true;
          } else if (
            !contentType.includes("text/html") &&
            !contentType.includes("text/plain") &&
            !contentType.includes("application/xhtml")
          ) {
            fetchFailed = true;
          } else {
            // Shared with the onboarding scrape. Reads <head> metadata as
            // well as body text, so a client-rendered site yields a real
            // description instead of an empty string.
            pageContent = extractPageContent(text, 8000).text;
          }
        } catch (fetchError: unknown) {
          const msg = fetchError instanceof Error ? fetchError.message : "fetch failed";
          if (/private|not allowed|resolve|Invalid URL|http/i.test(msg)) {
            return res.status(400).json({ success: false, error: "This URL is not allowed" });
          }
          fetchFailed = true;
        }

        if (fetchFailed || pageContent.length < 40) {
          return res.status(422).json({
            success: false,
            error:
              "We could not read any content from that site. Check the address, or create the brand manually.",
          });
        }

        let result: BrandProfile = brandProfileSchema.parse({});
        let analysisQuality: "full" | "partial" = "full";
        try {
          const completion = await analysisClient.chat.completions.create(
            {
              model: MODELS.brandAutofill,
              messages: [
                { role: "system", content: BRAND_PROFILE_SYSTEM_PROMPT },
                {
                  role: "user",
                  content: `Website URL: ${url}\n\nWebsite content:\n${pageContent}`,
                },
              ],
              response_format: { type: "json_object" },
              temperature: 0.3,
              // This call set no max_tokens at all, so it inherited the
              // provider default. Pin it, and pin it high: the sibling call
              // in routes/onboarding.ts was capped at 1200 and measured
              // 895-1209 completion tokens on a real content-rich page, so
              // the cap was truncating the JSON and producing blank forms.
              max_tokens: 3000,
            },
            { signal: AbortSignal.timeout(25000) },
          );

          const choice = completion.choices[0];
          const parsed = parseBrandProfile(choice?.message?.content);
          if (!parsed) {
            // Unparseable JSON - usually a response truncated at the token
            // cap. A failed read, not a thin site.
            logger.warn(
              { url, finishReason: choice?.finish_reason },
              "create-from-website: brand profile unparseable",
            );
            return res.status(502).json({
              success: false,
              error: "Website analysis failed. Please try again in a moment.",
            });
          }
          if (!parsed.name) {
            analysisQuality = "partial";
          }
          result = parsed;
        } catch (aiErr: any) {
          if (aiErr?.name === "AbortError" || aiErr?.name === "TimeoutError") {
            return res.status(504).json({
              success: false,
              error: "Website analysis timed out. Please try again or create the brand manually.",
            });
          }
          // A THROWN call is not a thin result. It used to fall through to
          // a brand created from the hostname, so an OpenRouter outage
          // produced a brand named "venturecite" in industry "General"
          // that looked like a successful analysis.
          logger.warn({ err: aiErr, url }, "create-from-website: LLM call failed");
          return res.status(502).json({
            success: false,
            error: "Website analysis failed. Please try again in a moment.",
          });
        }

        const brandData = {
          name: result.name || new URL(url).hostname.replace("www.", "").split(".")[0],
          companyName: result.companyName || result.name || "Unknown",
          industry: result.industry || "General",
          description: result.description || undefined,
          website: url,
          tone: result.tone || "professional",
          targetAudience: result.targetAudience || undefined,
          // The comma-string coercions that used to live here moved into
          // brandProfileSchema, which normalises every array field.
          products: result.products,
          keyValues: result.keyValues,
          uniqueSellingPoints: result.uniqueSellingPoints,
          brandVoice: result.brandVoice || undefined,
          nameVariations: result.nameVariations,
        };

        const existingByName = await brands.list();
        const nameLower = brandData.name.toLowerCase();
        if (!req.body?.force && existingByName.some((b) => b.name.toLowerCase() === nameLower)) {
          return res.status(409).json({
            success: false,
            error: `A brand named "${brandData.name}" already exists. Pass { force: true } to create anyway.`,
          });
        }

        try {
          const brand = await brands.createWithQuota(brandData, tierLimit);

          // Best-effort async automations: competitor discovery. Fact-sheet
          // The fact-sheet orchestration route handles scraping.
          waitUntil(
            (async () => {
              try {
                const { discoverCompetitors } = await import("../lib/competitorDiscovery");
                const n = await discoverCompetitors(brand.id);
                logger.info(
                  `[brand-create-from-website] discovered ${n} competitors for brand ${brand.id}`,
                );
              } catch (err) {
                logger.warn(
                  { err, brandId: brand.id },
                  `[brand-create-from-website] competitor discovery failed`,
                );
                captureAndFlush(err, {
                  tags: { source: "brands.ts:create-from-website-competitor-discovery" },
                });
              }
            })(),
          );

          res.json({ success: true, data: brand, analysisQuality });
        } catch (innerError) {
          if (innerError instanceof RequestBrandQuotaError) {
            return res.status(403).json({
              success: false,
              error: `Brand limit reached - your ${tier} plan allows ${tierLimit}. Delete an existing brand or upgrade for more.`,
              limitReached: true,
            });
          }
          throw innerError;
        }
      } catch (error) {
        sendError(res, error, "Failed to analyze website and create brand. Please try again.");
      }
    }),
  );

  app.post(
    "/api/brands",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const validatedData = insertBrandSchema.parse(req.body);

        if (validatedData.website) {
          try {
            new URL(validatedData.website);
          } catch {
            return res
              .status(400)
              .json({ success: false, error: "Please enter a valid website URL" });
          }
        }

        const brands = requestData.forActor(createRequestActor(user.id)).brands;
        const existingBrands = await brands.list();
        const nameLower = validatedData.name.toLowerCase();
        if (!req.body?.force && existingBrands.some((b) => b.name.toLowerCase() === nameLower)) {
          return res.status(409).json({
            success: false,
            error: `A brand named "${validatedData.name}" already exists.`,
          });
        }

        try {
          const tier = resolveTier(user);
          const tierLimit = (usageLimits[tier] || usageLimits.free).maxBrands;
          const brand = await brands.createWithQuota(
            {
              name: validatedData.name,
              companyName: validatedData.companyName,
              industry: validatedData.industry,
              factScrapeEnabled: validatedData.factScrapeEnabled,
              description: validatedData.description,
              website: validatedData.website,
              tone: validatedData.tone,
              targetAudience: validatedData.targetAudience,
              products: validatedData.products,
              keyValues: validatedData.keyValues,
              uniqueSellingPoints: validatedData.uniqueSellingPoints,
              brandVoice: validatedData.brandVoice,
              sampleContent: validatedData.sampleContent,
              nameVariations: validatedData.nameVariations,
              logoUrl: validatedData.logoUrl,
            },
            tierLimit,
          );

          // Best-effort async automations: competitor discovery. Fact-sheet
          // The fact-sheet orchestration route handles scraping.
          waitUntil(
            (async () => {
              try {
                const { discoverCompetitors } = await import("../lib/competitorDiscovery");
                await discoverCompetitors(brand.id);
              } catch (err) {
                logger.warn(
                  { err, brandId: brand.id },
                  `[brand-create] competitor discovery failed`,
                );
                captureAndFlush(err, { tags: { source: "brands.ts:create-competitor-discovery" } });
              }
            })(),
          );

          return res.json({ success: true, data: brand });
        } catch (innerError) {
          if (innerError instanceof RequestBrandQuotaError) {
            const tier = resolveTier(user);
            const tierLimit = (usageLimits[tier] || usageLimits.free).maxBrands;
            return res.status(403).json({
              success: false,
              error: `Brand limit reached - your ${tier} plan allows ${tierLimit}. Delete an existing brand, or upgrade for more.`,
              limitReached: true,
            });
          }
          throw innerError;
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ success: false, error: "Invalid brand data", details: error.issues });
        }
        captureAndFlush(error, { tags: { source: "brands.ts:363" } });
        res.status(500).json({ success: false, error: "Failed to create brand" });
      }
    }),
  );

  app.put(
    "/api/brands/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const actor = createRequestActor(user.id);
        const brands = requestData.forActor(actor).brands;
        const existing = await brands.get(req.params.id);
        if (!existing) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        // insertBrandSchema strips unknown fields. userId is never accepted.
        const validatedData = insertBrandSchema
          .partial()
          .omit({ userId: true } as any)
          .parse(req.body);
        const expectedVersion =
          typeof req.body?.expectedVersion === "number" ? req.body.expectedVersion : null;

        if (expectedVersion !== null) {
          const updated = await brands.updateIfVersion(
            req.params.id,
            expectedVersion,
            validatedData,
          );
          if (!updated) {
            const current = await brands.get(req.params.id);
            if (!current) {
              return res.status(404).json({ success: false, error: "Brand not found" });
            }
            return res.status(409).json({
              success: false,
              error:
                "Brand changed since you started editing. Refresh to see the latest values, then re-apply your changes.",
              code: "version_conflict",
              current,
            });
          }
          return res.json({ success: true, data: updated });
        }

        const updated = await brands.update(req.params.id, validatedData);
        if (!updated) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        res.json({ success: true, data: updated });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ success: false, error: "Invalid brand data", details: error.issues });
        }
        sendError(res, error, "Failed to update brand");
      }
    }),
  );

  // Show a pre-delete preview when the user opens the delete
  // dialog so we can show exact counts ("this will remove 47 articles, 12
  // runs, 5 prompts"). Counts only the heaviest child tables - the FK
  // cascade sweeps many more, but surfacing every single one would be noise.
  app.get(
    "/api/brands/:id/deletion-preview",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const preview = await requestData
          .forActor(createRequestActor(user.id))
          .brands.deletionPreview(req.params.id);
        if (!preview) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        res.json({
          success: true,
          data: preview,
        });
      } catch (error) {
        sendError(res, error, "Failed to preview deletion");
      }
    }),
  );

  app.delete(
    "/api/brands/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brands = requestData.forActor(createRequestActor(user.id)).brands;
        const existing = await brands.get(req.params.id);
        if (!existing) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        // Soft-delete with a 30-day grace period. The brand purge cron job
        // purge job hard-deletes after the window - at which point the FK
        // cascade clears every child row. List queries already filter
        // `deleted_at IS NULL` so the brand vanishes from the UI immediately.
        const softDeleted = await brands.softDelete(req.params.id);
        if (!softDeleted) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        await logAudit(req, {
          action: "brand.delete.scheduled",
          entityType: "brand",
          entityId: req.params.id,
          before: existing,
          after: {
            deletedAt: softDeleted.deletedAt?.toISOString(),
            deletionScheduledFor: softDeleted.deletionScheduledFor?.toISOString(),
          },
        });
        res.json({
          success: true,
          scheduledFor: softDeleted.deletionScheduledFor?.toISOString() ?? null,
        });
      } catch (error) {
        captureAndFlush(error, { tags: { source: "brands.ts:486" } });
        res.status(500).json({ success: false, error: "Failed to delete brand" });
      }
    }),
  );
}
