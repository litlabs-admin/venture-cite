// Brand CRUD routes (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split.
// The original monolith now only mounts this module via setupBrandRoutes.
//
// Includes:
//   POST /api/brands/create-from-website — LLM-fill brand fields from website and persist
//   GET  /api/brands                    — list user's (non-soft-deleted)
//   GET  /api/brands/:id                — single brand
//   POST /api/brands                    — manual create
//   PUT  /api/brands/:id                — update with optional optimistic lock
//   DELETE /api/brands/:id              — soft-delete with 30-day grace

import type { Express } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  articles,
  brandPrompts,
  citationRuns,
  insertBrandSchema,
  usageLimits,
} from "@shared/schema";
import { MODELS } from "../lib/modelConfig";
import { safeFetchText } from "../lib/ssrf";
import { requireUser } from "../lib/ownership";
import { withBrandQuota, isUsageLimitError } from "../lib/usageLimit";
import type { Tier } from "../lib/llmPricing";
import { logAudit } from "../lib/audit";
import { aiLimitMiddleware, openai, safeParseJson, sendError } from "../lib/routesShared";

export function setupBrandRoutes(app: Express): void {
  app.get("/api/brands", async (req, res) => {
    try {
      const user = requireUser(req);
      const brands = await storage.getBrandsByUserId(user.id);
      res.json({ success: true, data: brands });
    } catch (error) {
      sendError(res, error, "Failed to fetch brands");
    }
  });

  app.get("/api/brands/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandByIdForUser(req.params.id, user.id);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      res.json({ success: true, data: brand });
    } catch (error) {
      sendError(res, error, "Failed to fetch brand");
    }
  });

  app.post("/api/brands/create-from-website", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);

      // Wave 4.2: cheap pre-check for fast UX feedback. Authoritative
      // check happens inside withBrandQuota at insert time (FOR UPDATE).
      const tier = (user.accessTier || "free") as keyof typeof usageLimits;
      const tierLimit = (usageLimits[tier] || usageLimits.free).maxBrands;
      if (tierLimit !== -1) {
        const existingBrands = await storage.getBrandsByUserId(user.id);
        if (existingBrands.length >= tierLimit) {
          return res.status(403).json({
            success: false,
            error: `Brand limit reached — your ${tier} plan allows ${tierLimit}. Delete an existing brand or upgrade for more.`,
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
        return res
          .status(400)
          .json({ success: false, error: "Please enter a valid URL (e.g., https://yoursite.com)" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ success: false, error: "AI service is not configured" });
      }

      let pageContent = "";
      try {
        const { status, text, contentType } = await safeFetchText(url, {
          maxBytes: 2 * 1024 * 1024,
          timeoutMs: 10_000,
        });
        if (status < 200 || status >= 400) {
          pageContent = `Website at ${url} returned HTTP ${status}. Please analyze based on the URL/domain name alone.`;
        } else if (
          !contentType.includes("text/html") &&
          !contentType.includes("text/plain") &&
          !contentType.includes("application/xhtml")
        ) {
          pageContent = `Website at ${url} returned non-HTML content. Please analyze based on the URL/domain name alone.`;
        } else {
          pageContent = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 8000);
        }
      } catch (fetchError: unknown) {
        const msg = fetchError instanceof Error ? fetchError.message : "fetch failed";
        if (/private|not allowed|resolve|Invalid URL|http/i.test(msg)) {
          return res.status(400).json({ success: false, error: "This URL is not allowed" });
        }
        pageContent = `Could not fetch website content from ${url}. Please analyze based on the URL/domain name alone.`;
      }

      let result: Record<string, any> = {};
      let analysisQuality: "full" | "partial" = "full";
      try {
        const completion = await openai.chat.completions.create(
          {
            model: MODELS.brandAutofill,
            messages: [
              {
                role: "system",
                content: `You are an expert brand analyst. Given a company's website content, extract brand information and return a JSON object with these fields:
- name: The brand/product name (short)
- companyName: The full legal/company name
- industry: The primary industry (e.g., "Technology", "Healthcare", "Finance")
- description: A 2-3 sentence description of what the company does
- tone: One of: "professional", "casual", "friendly", "formal", "conversational", "authoritative"
- targetAudience: Who they sell to (e.g., "B2B SaaS companies", "small business owners")
- products: An array of main products/services (e.g., ["Product A", "Service B"])
- keyValues: An array of core brand values (e.g., ["Innovation", "Trust"])
- uniqueSellingPoints: An array of what makes them unique (e.g., ["AI-powered", "24/7 support"])
- brandVoice: A brief description of their communication style
- nameVariations: An array of common name variations for tracking (e.g., ["stripe", "stripe inc", "stripe payments"])

Be specific and accurate based on the content. If you can't determine something, make a reasonable inference from the domain/industry.`,
              },
              { role: "user", content: `Website URL: ${url}\n\nWebsite content:\n${pageContent}` },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
          },
          { signal: AbortSignal.timeout(25000) },
        );

        const parsed = safeParseJson<Record<string, any>>(completion.choices[0].message.content);
        if (!parsed || !parsed.name) {
          analysisQuality = "partial";
          result = parsed ?? {};
        } else {
          result = parsed;
        }
      } catch (aiErr: any) {
        if (aiErr?.name === "AbortError" || aiErr?.name === "TimeoutError") {
          return res.status(504).json({
            success: false,
            error: "Website analysis timed out. Please try again or create the brand manually.",
          });
        }
        analysisQuality = "partial";
      }

      const brandData = {
        name: result.name || new URL(url).hostname.replace("www.", "").split(".")[0],
        companyName: result.companyName || result.name || "Unknown",
        industry: result.industry || "General",
        description: result.description || undefined,
        website: url,
        tone: result.tone || "professional",
        targetAudience: result.targetAudience || undefined,
        products: Array.isArray(result.products)
          ? result.products
          : typeof result.products === "string"
            ? result.products.split(",").map((s: string) => s.trim())
            : [],
        keyValues: Array.isArray(result.keyValues)
          ? result.keyValues
          : typeof result.keyValues === "string"
            ? result.keyValues.split(",").map((s: string) => s.trim())
            : [],
        uniqueSellingPoints: Array.isArray(result.uniqueSellingPoints)
          ? result.uniqueSellingPoints
          : typeof result.uniqueSellingPoints === "string"
            ? result.uniqueSellingPoints.split(",").map((s: string) => s.trim())
            : [],
        brandVoice: result.brandVoice || undefined,
        nameVariations: Array.isArray(result.nameVariations)
          ? result.nameVariations
          : typeof result.nameVariations === "string"
            ? result.nameVariations.split(",").map((s: string) => s.trim())
            : [],
      };

      const existingByName = await storage.getBrandsByUserId(user.id);
      const nameLower = brandData.name.toLowerCase();
      if (!req.body?.force && existingByName.some((b) => b.name.toLowerCase() === nameLower)) {
        return res.status(409).json({
          success: false,
          error: `A brand named "${brandData.name}" already exists. Pass { force: true } to create anyway.`,
        });
      }

      try {
        const tier = (user.accessTier || "free") as Tier;
        const schema = await import("@shared/schema");
        const brand = await withBrandQuota(user.id, tier, async (tx) => {
          const [row] = await tx
            .insert(schema.brands)
            .values({ ...brandData, userId: user.id, tone: brandData.tone ?? "professional" })
            .returning();
          return row;
        });

        // Best-effort async automations: fact-sheet scrape + competitor
        // discovery. Fire the same way POST /api/brands does — this
        // endpoint is the primary onboarding path, so without these the
        // Fact Sheet and Competitors pages stay empty on first login.
        setImmediate(async () => {
          try {
            const { scrapeBrandFacts } = await import("../lib/factExtractor");
            const n = await scrapeBrandFacts(brand.id);
            console.log(`[brand-create-from-website] scraped ${n} facts for brand ${brand.id}`);
          } catch (err) {
            console.warn(
              `[brand-create-from-website] fact scrape failed for ${brand.id}:`,
              err instanceof Error ? err.message : err,
            );
          }
        });
        setImmediate(async () => {
          try {
            const { discoverCompetitors } = await import("../lib/competitorDiscovery");
            const n = await discoverCompetitors(brand.id);
            console.log(
              `[brand-create-from-website] discovered ${n} competitors for brand ${brand.id}`,
            );
          } catch (err) {
            console.warn(
              `[brand-create-from-website] competitor discovery failed for ${brand.id}:`,
              err instanceof Error ? err.message : err,
            );
          }
        });

        res.json({ success: true, data: brand, analysisQuality });
      } catch (innerError) {
        if (isUsageLimitError(innerError)) {
          return res
            .status(403)
            .json({ success: false, error: innerError.message, limitReached: true });
        }
        throw innerError;
      }
    } catch (error) {
      sendError(res, error, "Failed to analyze website and create brand. Please try again.");
    }
  });

  app.post("/api/brands", async (req, res) => {
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

      const existingBrands = await storage.getBrandsByUserId(user.id);
      const nameLower = validatedData.name.toLowerCase();
      if (!req.body?.force && existingBrands.some((b) => b.name.toLowerCase() === nameLower)) {
        return res
          .status(409)
          .json({ success: false, error: `A brand named "${validatedData.name}" already exists.` });
      }

      let brand: Awaited<ReturnType<typeof storage.createBrand>>;
      try {
        const tier = (user.accessTier || "free") as Tier;
        const schema = await import("@shared/schema");
        brand = await withBrandQuota(user.id, tier, async (tx) => {
          const [row] = await tx
            .insert(schema.brands)
            .values({
              ...validatedData,
              userId: user.id,
              tone: validatedData.tone ?? "professional",
            })
            .returning();
          return row;
        });
      } catch (innerError) {
        if (isUsageLimitError(innerError)) {
          return res
            .status(403)
            .json({ success: false, error: innerError.message, limitReached: true });
        }
        throw innerError;
      }

      // Best-effort async automations: fact-sheet scrape + competitor discovery.
      // Failures log but don't block the response. setImmediate so the HTTP
      // response fires first.
      setImmediate(async () => {
        try {
          const { scrapeBrandFacts } = await import("../lib/factExtractor");
          await scrapeBrandFacts(brand.id);
        } catch (err) {
          console.warn(
            `[brand-create] fact scrape failed for ${brand.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      });
      setImmediate(async () => {
        try {
          const { discoverCompetitors } = await import("../lib/competitorDiscovery");
          await discoverCompetitors(brand.id);
        } catch (err) {
          console.warn(
            `[brand-create] competitor discovery failed for ${brand.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      });

      res.json({ success: true, data: brand });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid brand data", details: error.errors });
      }
      res.status(500).json({ success: false, error: "Failed to create brand" });
    }
  });

  app.put("/api/brands/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const existing = await storage.getBrandByIdForUser(req.params.id, user.id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      // insertBrandSchema strips unknown fields; .partial() lets clients
      // omit any field. userId is never in the insert schema so it can't
      // be forged here.
      const validatedData = insertBrandSchema
        .partial()
        .omit({ userId: true } as any)
        .parse(req.body);

      // Wave 4.4: optimistic locking. When the client sends
      // `expectedVersion` (echoed from the GET it edited from), the
      // UPDATE only matches if nobody else wrote in between.
      const expectedVersion =
        typeof req.body?.expectedVersion === "number" ? req.body.expectedVersion : null;

      let brand;
      if (expectedVersion !== null) {
        brand = await storage.updateBrandIfVersion(req.params.id, expectedVersion, validatedData);
        if (!brand) {
          return res.status(409).json({
            success: false,
            error:
              "Brand changed since you started editing. Refresh to see the latest values, then re-apply your changes.",
            code: "version_conflict",
            current: existing,
          });
        }
      } else {
        brand = await storage.updateBrand(req.params.id, validatedData);
        if (!brand) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
      }
      res.json({ success: true, data: brand });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid brand data", details: error.errors });
      }
      sendError(res, error, "Failed to update brand");
    }
  });

  // Wave 6.6: pre-delete preview. Called when the user opens the delete
  // dialog so we can show exact counts ("this will remove 47 articles, 12
  // runs, 5 prompts"). Counts only the heaviest child tables — the FK
  // cascade sweeps many more, but surfacing every single one would be noise.
  app.get("/api/brands/:id/deletion-preview", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandByIdForUser(req.params.id, user.id);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      const brandId = req.params.id;
      const [articleRow] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(articles)
        .where(sql`${articles.brandId} = ${brandId}`);
      const [promptRow] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(brandPrompts)
        .where(sql`${brandPrompts.brandId} = ${brandId}`);
      const [runRow] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(citationRuns)
        .where(sql`${citationRuns.brandId} = ${brandId}`);

      res.json({
        success: true,
        data: {
          articles: articleRow?.n ?? 0,
          prompts: promptRow?.n ?? 0,
          citationRuns: runRow?.n ?? 0,
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to preview deletion");
    }
  });

  app.delete("/api/brands/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const existing = await storage.getBrandByIdForUser(req.params.id, user.id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      // Wave 4.5: soft-delete with 30-day grace. The cron-driven brand
      // purge job hard-deletes after the window — at which point the FK
      // cascade clears every child row. List queries already filter
      // `deleted_at IS NULL` so the brand vanishes from the UI immediately.
      const softDeleted = await storage.softDeleteBrand(req.params.id);
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
      res.status(500).json({ success: false, error: "Failed to delete brand" });
    }
  });
}
