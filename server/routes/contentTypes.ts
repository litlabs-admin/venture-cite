// Content types: listicles, wikipedia, BOFU, FAQs (Wave 5.1).
//
// Extracted verbatim from server/routes.ts as part of the per-domain
// split. Route handler bodies are byte-identical to the monolith; only
// helper imports were hoisted to ../lib/routesShared and
// ../lib/ownership.

import type { Express } from "express";
import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import {
  requireUser,
  requireBrand,
  requireArticle,
  requireFaq,
  requireListicle,
  requireBofuContent,
  getUserBrandIds,
  pickFields,
} from "../lib/ownership";
import {
  openai,
  aiLimitMiddleware,
  sendError,
  safeParseJson,
  asyncHandler,
} from "../lib/routesShared";
import { acquireOrWait, secondsUntilAvailable } from "../lib/rateLimitBuckets";
import {
  loadBrandGenerationContext,
  renderFactsBlock,
  renderCompetitorBlock,
} from "../lib/brandGenerationContext";
import { computeAiSurfaceScore } from "../lib/faqScoring";
import { normalizeUrl } from "../lib/trackedContentMatcher";

import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
// Wave 9.4: keep tracked_content_urls in sync with bofu_content / faq_items
// publishedUrl. Called from PATCH handlers; defensive against partial inputs.
async function syncTrackedContentUrl(
  sourceType: "bofu" | "faq",
  sourceId: string,
  brandId: string,
  publishedUrl: string | null | undefined,
): Promise<void> {
  if (publishedUrl && typeof publishedUrl === "string" && publishedUrl.trim()) {
    const normalized = normalizeUrl(publishedUrl);
    if (!normalized) return; // unparseable; leave the row unchanged
    await storage.upsertTrackedContentUrl({
      brandId,
      sourceType,
      sourceId,
      url: publishedUrl.trim(),
      normalizedUrl: normalized,
    });
  } else if (publishedUrl === null || publishedUrl === "") {
    // Explicit unpublish — drop the tracking row.
    await storage.deleteTrackedContentUrlBySource(sourceType, sourceId);
  }
}

export function setupContentTypesRoutes(app: Express): void {
  // ========== LISTICLE TRACKER ==========

  const LISTICLE_WRITE_FIELDS = [
    "brandId",
    "title",
    "url",
    "sourcePublication",
    "listPosition",
    "totalListItems",
    "isIncluded",
    "competitorsMentioned",
    "keyword",
    "searchVolume",
    "domainAuthority",
    // Wave 9.4: outreach lifecycle.
    "outreachStatus",
    "outreachNotes",
    "metadata",
  ] as const;
  const LISTICLE_OUTREACH_STATUSES = new Set(["new", "contacted", "won", "dropped"]);

  // Get listicles for a brand — :brandId app.param checks ownership.
  app.get(
    "/api/listicles/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const listicles = await storage.getListicles(req.params.brandId);
        res.json({ success: true, data: listicles });
      } catch (error) {
        sendError(res, error, "Failed to fetch listicles");
      }
    }),
  );

  // List listicles across user's brands (with optional brandId filter).
  app.get(
    "/api/listicles",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brandId = req.query.brandId as string | undefined;
        if (brandId) {
          const listicles = await storage.getListicles(brandId);
          return res.json({ success: true, data: listicles });
        }
        const brandIds = await getUserBrandIds(user.id);
        const all = await storage.getListicles();
        const listicles = all.filter((l: any) => l.brandId && brandIds.has(l.brandId));
        res.json({ success: true, data: listicles });
      } catch (error) {
        sendError(res, error, "Failed to fetch listicles");
      }
    }),
  );

  // Create a listicle — brandId must belong to caller. Wave 9.4: use
  // tryInsertListicle so the unique (brand_id, lower(url)) index is the
  // arbiter; manual entry returns 409 if the URL is already tracked.
  app.post(
    "/api/listicles",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = pickFields<any>(req.body, LISTICLE_WRITE_FIELDS);
        if (!body.brandId || typeof body.brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(body.brandId, user.id);
        if (!body.title || !body.url) {
          return res.status(400).json({ success: false, error: "title and url are required" });
        }
        const listicle = await storage.tryInsertListicle(body as any);
        if (!listicle) {
          return res
            .status(409)
            .json({ success: false, error: "A listicle with this URL is already tracked" });
        }
        res.json({ success: true, data: listicle });
      } catch (error) {
        sendError(res, error, "Failed to create listicle");
      }
    }),
  );

  // Update a listicle — ownership required.
  app.patch(
    "/api/listicles/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireListicle(req.params.id, user.id);
        const update = pickFields<any>(req.body, LISTICLE_WRITE_FIELDS);
        if (update.brandId && typeof update.brandId === "string") {
          await requireBrand(update.brandId, user.id);
        }
        // Wave 9.4: validate outreach status transitions. Categorical
        // column, not a strict state machine — users can correct mistakes
        // by moving back to any prior state.
        if (update.outreachStatus !== undefined) {
          if (!LISTICLE_OUTREACH_STATUSES.has(update.outreachStatus)) {
            return res.status(400).json({ success: false, error: "Invalid outreachStatus" });
          }
        }
        const listicle = await storage.updateListicle(req.params.id, update as any);
        if (!listicle) return res.status(404).json({ success: false, error: "Listicle not found" });
        res.json({ success: true, data: listicle });
      } catch (error) {
        sendError(res, error, "Failed to update listicle");
      }
    }),
  );

  // Delete a listicle — ownership required.
  app.delete(
    "/api/listicles/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireListicle(req.params.id, user.id);
        const deleted = await storage.deleteListicle(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: "Listicle not found" });
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete listicle");
      }
    }),
  );

  // Discover listicles for a brand using AI
  app.post(
    "/api/listicles/discover/:brandId",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        if (!(await acquireOrWait("manual-discovery", brand.id, 0))) {
          const secs = await secondsUntilAvailable("manual-discovery", brand.id);
          return res.status(429).json({
            success: false,
            error: "rate_limited",
            message: `Discovery is on a short cooldown for this brand. Try again in ~${secs}s.`,
          });
        }

        const { scanBrandListicles } = await import("../lib/listicleScanner");
        // Wave 9.4: full ScanReport — includes reverified/lostInclusion +
        // multi-line failure list so the toast can surface partial failures.
        const report = await scanBrandListicles(brand.id);
        const listicles = await storage.getListicles(brand.id);

        res.json({
          success: true,
          data: {
            brand: { id: brand.id, name: brand.name },
            report,
            // Legacy field aliases kept for any existing client that
            // still reads { inserted, candidates }. New clients should
            // read `report.*` directly.
            inserted: report.inserted,
            candidates: report.found,
            reason: report.found === 0 ? "no_candidates" : "ok",
            listicles,
            tips: [
              "Listicles where you're not yet listed are outreach targets",
              "Focus on listicles from high-domain-authority publications",
              "Re-scan weekly — new listicles appear regularly in active categories",
            ],
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to discover listicles");
      }
    }),
  );

  // ========== WIKIPEDIA MONITOR ==========

  // Get Wikipedia mentions for a brand
  app.get(
    "/api/wikipedia/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const mentions = await storage.getWikipediaMentions(req.params.brandId);
        res.json({ success: true, data: mentions });
      } catch (error) {
        captureAndFlush(error, { tags: { source: "contentTypes.ts:217" } });
        res.status(500).json({ success: false, error: "Failed to fetch Wikipedia mentions" });
      }
    }),
  );

  const WIKIPEDIA_WRITE_FIELDS = [
    "brandId",
    "pageTitle",
    "pageUrl",
    "mentionContext",
    "mentionType",
    "sectionName",
    "isActive",
    "metadata",
  ] as const;

  // Create Wikipedia mention — brandId must belong to caller. Wave 9.4:
  // tryInsert so manual-add surfaces a 409 instead of duplicating.
  app.post(
    "/api/wikipedia",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = pickFields<any>(req.body, WIKIPEDIA_WRITE_FIELDS);
        if (!body.brandId || typeof body.brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(body.brandId, user.id);
        if (!body.pageTitle || !body.pageUrl) {
          return res
            .status(400)
            .json({ success: false, error: "pageTitle and pageUrl are required" });
        }
        const mention = await storage.tryInsertWikipediaMention(body as any);
        if (!mention) {
          return res.status(409).json({
            success: false,
            error: "A mention for this Wikipedia page is already tracked",
          });
        }
        res.json({ success: true, data: mention });
      } catch (error) {
        sendError(res, error, "Failed to create Wikipedia mention");
      }
    }),
  );

  // Scan for Wikipedia opportunities — real MediaWiki API + LLM classification.
  app.post(
    "/api/wikipedia/scan/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        if (!(await acquireOrWait("manual-discovery", brand.id, 0))) {
          const secs = await secondsUntilAvailable("manual-discovery", brand.id);
          return res.status(429).json({
            success: false,
            error: "rate_limited",
            message: `Discovery is on a short cooldown for this brand. Try again in ~${secs}s.`,
          });
        }

        const { scanBrandWikipedia } = await import("../lib/wikipediaScanner");
        const report = await scanBrandWikipedia(brand.id);
        const mentions = await storage.getWikipediaMentions(brand.id);

        res.json({
          success: true,
          data: {
            brand: { id: brand.id, name: brand.name },
            report,
            // Legacy aliases for back-compat.
            existing: report.existing,
            opportunities: report.opportunities,
            inserted: report.inserted,
            mentions,
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to scan Wikipedia");
      }
    }),
  );

  // ========== BOFU CONTENT GENERATOR ==========

  // Get BOFU content for a brand
  app.get(
    "/api/bofu-content/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const contentType = req.query.contentType as string;
        const content = await storage.getBofuContent(req.params.brandId, contentType);
        res.json({ success: true, data: content });
      } catch (error) {
        sendError(res, error, "Failed to fetch BOFU content");
      }
    }),
  );

  const BOFU_WRITE_FIELDS = [
    "brandId",
    "contentType",
    "title",
    "content",
    "primaryKeyword",
    "comparedWith",
    "targetIntent",
    "status",
    "aiScore",
    "publishedUrl",
    "publishedAt",
    "metadata",
  ] as const;

  app.get(
    "/api/bofu-content",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId, contentType } = req.query;
        if (brandId && typeof brandId === "string") {
          const content = await storage.getBofuContent(brandId, contentType as string);
          return res.json({ success: true, data: content });
        }
        const brandIds = await getUserBrandIds(user.id);
        const all = await storage.getBofuContent(undefined, contentType as string);
        const content = all.filter((b: any) => b.brandId && brandIds.has(b.brandId));
        res.json({ success: true, data: content });
      } catch (error) {
        sendError(res, error, "Failed to fetch BOFU content");
      }
    }),
  );

  // Create BOFU content — brandId ownership required.
  app.post(
    "/api/bofu-content",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = pickFields<any>(req.body, BOFU_WRITE_FIELDS);
        if (!body.brandId || typeof body.brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(body.brandId, user.id);
        if (!body.contentType || !body.title || !body.content) {
          return res
            .status(400)
            .json({ success: false, error: "contentType, title and content are required" });
        }
        const content = await storage.createBofuContent(body as any);
        res.json({ success: true, data: content });
      } catch (error) {
        sendError(res, error, "Failed to create BOFU content");
      }
    }),
  );

  // Update BOFU content — ownership required.
  app.patch(
    "/api/bofu-content/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBofuContent(req.params.id, user.id);
        const update = pickFields<any>(req.body, BOFU_WRITE_FIELDS);
        if (update.brandId && typeof update.brandId === "string") {
          await requireBrand(update.brandId, user.id);
        }
        // Wave 9.4: when the user marks the piece as published (toggles
        // the publishedAt timestamp), accept either the explicit value or
        // a "publish now" sentinel. publishedUrl can be cleared by sending
        // null or "".
        if (update.publishedAt && typeof update.publishedAt === "string") {
          update.publishedAt = new Date(update.publishedAt);
        }
        const content = await storage.updateBofuContent(req.params.id, update as any);
        if (!content) return res.status(404).json({ success: false, error: "Content not found" });
        // Sync tracked_content_urls on every PATCH that touches publishedUrl.
        if (Object.prototype.hasOwnProperty.call(update, "publishedUrl")) {
          await syncTrackedContentUrl("bofu", content.id, content.brandId, update.publishedUrl);
        }
        res.json({ success: true, data: content });
      } catch (error) {
        sendError(res, error, "Failed to update BOFU content");
      }
    }),
  );

  // Delete BOFU content — ownership required.
  app.delete(
    "/api/bofu-content/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBofuContent(req.params.id, user.id);
        const deleted = await storage.deleteBofuContent(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: "Content not found" });
        // Wave 9.4: remove from tracked content registry (no-op if it
        // wasn't published).
        await storage.deleteTrackedContentUrlBySource("bofu", req.params.id).catch(() => {});
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete BOFU content");
      }
    }),
  );

  // Generate BOFU content using AI — ownership required.
  app.post(
    "/api/bofu-content/generate",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId, contentType, comparedWith, keyword } = req.body ?? {};
        if (!brandId || typeof brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(brandId, user.id);

        // Wave 9.4: load full grounding context — fact sheet + ALL
        // tracked competitors (was: comparedWith[0] only). The fact-sheet
        // block + per-competitor verified data goes into the prompt so
        // the LLM stops inventing comparison features.
        const ctx = await loadBrandGenerationContext(
          brandId,
          Array.isArray(comparedWith) ? comparedWith : [],
        );
        if (!ctx) return res.status(404).json({ success: false, error: "Brand not found" });
        const { brand, facts, competitorsResolved } = ctx;
        const factsBlock = renderFactsBlock(facts);
        const competitorBlock = renderCompetitorBlock(competitorsResolved);
        const groundingNote = factsBlock
          ? '\n\nGrounding rules:\n- Use only facts in the Verified-facts block above for claims about this brand.\n- For competitor specifics not in the Competitors block, hedge with phrases like "commonly reported as" or omit.\n- If a comparison data point is unknown, say so explicitly rather than inventing a number.\n'
          : '\n\nGrounding rules:\n- This brand has no verified facts on file. Avoid specific numbers or feature claims; describe at a category level only and hedge with "commonly" / "typically".\n';
        const competitorNamesForTitle = competitorsResolved.map((c) => c.name).filter(Boolean);
        const firstCompetitor = competitorNamesForTitle[0] ?? "Competitor";

        let prompt = "";
        let title = "";

        if (contentType === "comparison") {
          title =
            competitorNamesForTitle.length > 1
              ? `${brand.name} vs ${competitorNamesForTitle.slice(0, 3).join(" vs ")}: Complete Comparison Guide`
              : `${brand.name} vs ${firstCompetitor}: Complete Comparison Guide`;
          prompt = `Create a comprehensive comparison article: "${title}"

Brand: ${brand.name}
Industry: ${brand.industry}
Description: ${brand.description || ""}
Key Products/Services: ${Array.isArray(brand.products) ? brand.products.join(", ") : ""}
Unique Selling Points: ${Array.isArray((brand as any).uniqueSellingPoints) ? (brand as any).uniqueSellingPoints.join(", ") : ""}

${factsBlock}

${competitorBlock}

${groundingNote}

Create an in-depth, balanced comparison (1500+ words) that:
1. Compares features, pricing, pros/cons objectively across ALL competitors listed above (not just one)
2. Helps readers make an informed decision
3. Is optimized for AI citation (structured with headers, tables, clear conclusions)
4. Includes a FAQ section at the end
5. Uses a comparison table near the top so AI engines can extract structured data

Format with markdown headers. Be balanced but highlight genuine strengths of ${brand.name} grounded in the verified facts above.`;
        } else if (contentType === "alternatives") {
          title = `Top ${brand.name} Alternatives: Best Options for ${new Date().getFullYear()}`;
          prompt = `Create an alternatives guide that positions ${brand.name} alongside the alternatives listed below.

Brand: ${brand.name}
Industry: ${brand.industry}

${factsBlock}

${competitorBlock}

${groundingNote}

Create a comprehensive alternatives guide (1500+ words) that:
1. Lists each tracked competitor above PLUS ${brand.name} as alternatives, with pros/cons grounded in the verified facts
2. Explains why someone might look for alternatives
3. Positions ${brand.name} favorably but honestly
4. Includes FAQ section for AI indexing

Format with markdown. Each alternative should have clear headers and bullet points.`;
        } else if (contentType === "guide") {
          title = keyword
            ? `${keyword}: Complete Guide for ${new Date().getFullYear()}`
            : `${brand.industry} Buying Guide`;
          prompt = `Create a transactional buying guide for ${brand.industry}.

Brand: ${brand.name}
Target Keyword: ${keyword || brand.industry + " guide"}

${factsBlock}

${groundingNote}

Create a comprehensive buyer's guide (1500+ words) that:
1. Helps buyers understand what to look for
2. Explains key features and considerations
3. Naturally mentions ${brand.name} as a solution, citing the verified facts above
4. Includes comparison tables and checklists
5. Has a detailed FAQ section

This is bottom-of-funnel content designed to convert and get cited by AI.`;
        } else {
          return res.status(400).json({ success: false, error: "Invalid content type" });
        }

        const response = await openai.chat.completions.create({
          model: MODELS.misc,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 4000,
        });

        const generatedContent = response.choices[0].message.content || "";

        // Save to storage
        const saved = await storage.createBofuContent({
          brandId,
          contentType,
          title,
          content: generatedContent,
          primaryKeyword: keyword || null,
          comparedWith: comparedWith || null,
          targetIntent: "transactional",
          status: "draft",
          // aiScore left null on generate; populated only when an actual
          // scoring step runs (e.g. via PATCH from the optimizer). The
          // previous hard-coded 85 was misleading — users read it as a
          // real quality signal.
        });

        res.json({
          success: true,
          data: saved,
          tips: [
            "BOFU content converts 80% better than top-of-funnel",
            "Include comparison tables for AI snippet optimization",
            "Add FAQ sections - AI surfaces these frequently",
            "Publish on your site + distribute to Medium/LinkedIn",
          ],
        });
      } catch (error) {
        sendError(res, error, "Failed to generate BOFU content");
      }
    }),
  );

  // ========== FAQ OPTIMIZER ==========

  // Get FAQ items
  app.get(
    "/api/faqs/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const faqs = await storage.getFaqItems(req.params.brandId);
        res.json({ success: true, data: faqs });
      } catch (error) {
        sendError(res, error, "Failed to fetch FAQs");
      }
    }),
  );

  const FAQ_WRITE_FIELDS = [
    "brandId",
    "articleId",
    "question",
    "answer",
    "category",
    "searchVolume",
    "aiSurfaceScore",
    "isOptimized",
    "optimizationTips",
    "publishedUrl",
    "publishedAt",
    "metadata",
  ] as const;

  app.get(
    "/api/faqs",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const { brandId, articleId } = req.query;
        if (brandId && typeof brandId === "string") {
          const faqs = await storage.getFaqItems(brandId, articleId as string);
          return res.json({ success: true, data: faqs });
        }
        const brandIds = await getUserBrandIds(user.id);
        const all = await storage.getFaqItems(undefined, articleId as string);
        const faqs = all.filter((f: any) => f.brandId && brandIds.has(f.brandId));
        res.json({ success: true, data: faqs });
      } catch (error) {
        sendError(res, error, "Failed to fetch FAQs");
      }
    }),
  );

  // Create FAQ — brandId ownership required.
  app.post(
    "/api/faqs",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const body = pickFields<any>(req.body, FAQ_WRITE_FIELDS);
        if (!body.brandId || typeof body.brandId !== "string") {
          return res.status(400).json({ success: false, error: "brandId is required" });
        }
        await requireBrand(body.brandId, user.id);
        if (body.articleId && typeof body.articleId === "string") {
          await requireArticle(body.articleId, user.id);
        }
        if (!body.question || !body.answer) {
          return res
            .status(400)
            .json({ success: false, error: "question and answer are required" });
        }
        const faq = await storage.createFaqItem(body as any);
        res.json({ success: true, data: faq });
      } catch (error) {
        sendError(res, error, "Failed to create FAQ");
      }
    }),
  );

  // Update FAQ — ownership required.
  app.patch(
    "/api/faqs/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireFaq(req.params.id, user.id);
        const update = pickFields<any>(req.body, FAQ_WRITE_FIELDS);
        if (update.brandId && typeof update.brandId === "string") {
          await requireBrand(update.brandId, user.id);
        }
        if (update.publishedAt && typeof update.publishedAt === "string") {
          update.publishedAt = new Date(update.publishedAt);
        }
        // Wave 9.4: recompute aiSurfaceScore deterministically when the
        // question or answer changes. The legacy LLM-self-scored field
        // produced inconsistent values; this gives a stable signal.
        if (update.question !== undefined || update.answer !== undefined) {
          const existing = await storage.getFaqItemById(req.params.id);
          if (existing) {
            const brand = await storage.getBrandById(existing.brandId);
            update.aiSurfaceScore = computeAiSurfaceScore({
              question: update.question ?? existing.question,
              answer: update.answer ?? existing.answer,
              brand: brand
                ? { name: brand.name, nameVariations: brand.nameVariations ?? [] }
                : null,
            });
          }
        }
        const faq = await storage.updateFaqItem(req.params.id, update as any);
        if (!faq) return res.status(404).json({ success: false, error: "FAQ not found" });
        if (Object.prototype.hasOwnProperty.call(update, "publishedUrl")) {
          await syncTrackedContentUrl("faq", faq.id, faq.brandId, update.publishedUrl);
        }
        res.json({ success: true, data: faq });
      } catch (error) {
        sendError(res, error, "Failed to update FAQ");
      }
    }),
  );

  // Delete FAQ — ownership required.
  app.delete(
    "/api/faqs/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireFaq(req.params.id, user.id);
        const deleted = await storage.deleteFaqItem(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: "FAQ not found" });
        await storage.deleteTrackedContentUrlBySource("faq", req.params.id).catch(() => {});
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete FAQ");
      }
    }),
  );

  // Optimize a single FAQ for AI citation — ownership required.
  app.post(
    "/api/faqs/:id/optimize",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const faq = await requireFaq(req.params.id, user.id);

        // Wave 9.4: pull the full grounding context (fact sheet) so the
        // optimizer can hedge against unverified claims rather than
        // inventing them.
        const ctx = faq.brandId ? await loadBrandGenerationContext(faq.brandId, []) : null;
        const brand = ctx?.brand ?? null;
        const factsBlock = ctx ? renderFactsBlock(ctx.facts) : "";
        const brandContext = brand
          ? `Brand: ${brand.name}, Industry: ${brand.industry}, Products: ${Array.isArray(brand.products) ? brand.products.join(", ") : "N/A"}`
          : "";

        const prompt = `You are an FAQ optimization expert for AI search engines. Optimize this FAQ for maximum AI citation likelihood.

Current FAQ:
Question: ${faq.question}
Answer: ${faq.answer}

Brand Context: ${brandContext}

${factsBlock}

Optimization requirements:
1. Question should be natural and mirror how users ask AI chatbots
2. Answer should be 40-60 words (optimal for AI summarization)
3. Answer should start with a direct response, then provide context
4. Use ONLY facts from the Verified-facts block above; hedge or omit anything unverified
5. Make it authoritative but conversational

Return JSON:
{
  "question": "Optimized question",
  "answer": "Optimized answer (40-60 words)",
  "optimizationTips": ["What was improved", "Additional suggestions"]
}

Return ONLY valid JSON. Do not include an aiSurfaceScore field — it is computed deterministically server-side.`;

        const response = await openai.chat.completions.create({
          model: MODELS.misc,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        });

        const optimized = safeParseJson<any>(response.choices[0].message.content);
        if (!optimized) {
          return res
            .status(502)
            .json({ success: false, error: "Failed to parse optimization result" });
        }

        const finalQuestion = optimized.question || faq.question;
        const finalAnswer = optimized.answer || faq.answer;
        // Wave 9.4: deterministic score; LLM's number is ignored.
        const aiSurfaceScore = computeAiSurfaceScore({
          question: finalQuestion,
          answer: finalAnswer,
          brand: brand ? { name: brand.name, nameVariations: brand.nameVariations ?? [] } : null,
        });

        const updatedFaq = await storage.updateFaqItem(req.params.id, {
          question: finalQuestion,
          answer: finalAnswer,
          aiSurfaceScore,
          isOptimized: 1,
          optimizationTips: Array.isArray(optimized.optimizationTips)
            ? optimized.optimizationTips
            : [],
        });

        res.json({ success: true, data: updatedFaq });
      } catch (error) {
        sendError(res, error, "Failed to optimize FAQ");
      }
    }),
  );

  // Generate optimized FAQs for a brand
  app.post(
    "/api/faqs/generate/:brandId",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        // Wave 9.4: ownership-checked above; pull grounding context.
        const ctx = await loadBrandGenerationContext(req.params.brandId, []);
        if (!ctx) return res.status(404).json({ success: false, error: "Brand not found" });
        const { brand, facts } = ctx;

        if (!(await acquireOrWait("manual-discovery", brand.id, 0))) {
          const secs = await secondsUntilAvailable("manual-discovery", brand.id);
          return res.status(429).json({
            success: false,
            error: "rate_limited",
            message: `Generation is on a short cooldown for this brand. Try again in ~${secs}s.`,
          });
        }

        const factsBlock = renderFactsBlock(facts);

        const { topic, count = 5 } = req.body;
        const faqCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);

        const prompt = `You are an FAQ optimization expert for AI search engines. Generate exactly ${faqCount} FAQs for ${brand.name} (${brand.industry}).

Topic focus: ${topic || brand.industry}
Company description: ${brand.description || ""}
Products/Services: ${Array.isArray(brand.products) ? brand.products.join(", ") : ""}

${factsBlock}

Grounding rules:
- Use only the verified facts above for any specific number, percentage, feature, or named integration.
- For anything not in that block, hedge ("commonly", "typically") or omit. Never invent specific numbers.

Generate FAQs that:
1. Mirror how users ask AI chatbots questions
2. Have clear, concise answers (40-60 words optimal)
3. Include the brand name naturally where relevant
4. Cover common objections and buying considerations

Return JSON array:
[{
  "question": "The question users might ask AI",
  "answer": "Concise, authoritative answer",
  "category": "pricing|features|comparison|support|general",
  "optimizationTips": ["tip1", "tip2"]
}]

Return ONLY the JSON array. Do NOT include any aiSurfaceScore field — it is computed server-side from a deterministic heuristic.`;

        const response = await openai.chat.completions.create({
          model: MODELS.misc,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        });

        const parsed = safeParseJson<any[]>(response.choices[0].message.content);
        const faqs: any[] = Array.isArray(parsed) ? parsed : [];

        // Save sequentially with per-item try/catch so one bad item doesn't
        // abort the whole batch (fixes the Promise.all partial-failure bug).
        // Wave 9.4: also dedupe semantically against existing FAQs and
        // compute the aiSurfaceScore heuristically.
        const savedFaqs: any[] = [];
        let merged = 0;
        let invalid = 0;
        for (const faq of faqs) {
          if (!faq || typeof faq.question !== "string" || typeof faq.answer !== "string") {
            invalid += 1;
            continue;
          }
          try {
            const similar = await storage
              .findSimilarFaqQuestion(brand.id, faq.question)
              .catch(() => null);
            if (similar) {
              merged += 1;
              continue;
            }
            const aiSurfaceScore = computeAiSurfaceScore({
              question: faq.question,
              answer: faq.answer,
              brand: { name: brand.name, nameVariations: brand.nameVariations ?? [] },
            });
            const saved = await storage.createFaqItem({
              brandId: brand.id,
              question: faq.question,
              answer: faq.answer,
              category: faq.category ?? null,
              aiSurfaceScore,
              // Generation produces draft FAQs; the per-FAQ optimizer is
              // a separate manual step that flips this to 1.
              isOptimized: 0,
              optimizationTips: Array.isArray(faq.optimizationTips) ? faq.optimizationTips : [],
            });
            savedFaqs.push(saved);
          } catch (err) {
            logger.warn({ err: err }, "[faqs] createFaqItem failed for one item");
          }
        }

        res.json({
          success: true,
          data: savedFaqs,
          report: {
            requested: faqCount,
            generated: faqs.length,
            inserted: savedFaqs.length,
            mergedDuplicates: merged,
            invalid,
          },
          tips: [
            "Add FAQ schema markup to your pages for rich snippets",
            "Keep answers 40-60 words for optimal AI summarization",
            "Update FAQs quarterly with new questions from support",
            "Include FAQs on product pages, not just a dedicated FAQ page",
          ],
        });
      } catch (error) {
        sendError(res, error, "Failed to generate FAQs");
      }
    }),
  );

  // ============================================================
  // Wave 9.4: GEO Tools header summary endpoint.
  // ============================================================
  app.get(
    "/api/geo-tools/summary/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const summary = await storage.getGeoToolsSummary(req.params.brandId);
        res.json({ success: true, data: summary });
      } catch (error) {
        sendError(res, error, "Failed to load GEO Tools summary");
      }
    }),
  );

  // ============================================================
  // Wave 9.4: Wikipedia draft-text helper. NPOV-tuned 2-3 sentence
  // mention the user can paste into the Wikipedia edit form.
  // ============================================================
  app.post(
    "/api/wikipedia/draft/:mentionId",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const mention = await storage
          .getWikipediaMentions()
          .then((rows) => rows.find((m) => m.id === req.params.mentionId));
        if (!mention) {
          return res.status(404).json({ success: false, error: "Mention not found" });
        }
        await requireBrand(mention.brandId, user.id);
        const ctx = await loadBrandGenerationContext(mention.brandId, []);
        if (!ctx) return res.status(404).json({ success: false, error: "Brand not found" });
        const { brand, facts } = ctx;
        const factsBlock = renderFactsBlock(facts);

        const prompt = `You are drafting a Wikipedia mention for the brand "${brand.name}" on the page "${mention.pageTitle}". Wikipedia requires neutral point of view (NPOV) — no marketing language, no superlatives, no claims that aren't backed by a citation.

Brand context:
${factsBlock || `- ${brand.name} (${brand.industry || "unspecified industry"})`}

Page context (existing extract from the article):
${(mention.mentionContext || "").slice(0, 1500)}

Write 2-3 sentences (max ~80 words) that mention the brand neutrally in the context of the page topic. The text MUST:
- Be encyclopedic and factual
- Use only verified facts from the brand-context block above
- Be drop-in addable to the article (don't repeat the page title; assume it's added inside an existing section)
- Suggest a likely citation source after the sentence in parentheses (e.g. "(see: company website / industry report)")

Return ONLY the draft text, no preamble.`;

        const response = await openai.chat.completions.create({
          model: MODELS.misc,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_tokens: 250,
        });

        const draft = (response.choices[0]?.message?.content || "").trim();
        res.json({
          success: true,
          data: {
            draft,
            notes: [
              "Wikipedia requires reliable, independent sources — replace the parenthetical citation hint with a real reference URL before submitting.",
              "Verify your brand meets Wikipedia's WP:NOTABILITY guideline before adding a mention.",
              "Disclose any conflict of interest on the article's talk page (WP:COI).",
            ],
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to draft Wikipedia mention");
      }
    }),
  );
}
