// Content type routes for listicles, Wikipedia, BOFU, and FAQs.
//
// Extracted verbatim from server/routes.ts as part of the per-domain
// split. Route handler bodies are byte-identical to the monolith; only
// helper imports were hoisted to ../lib/routesShared and
// ../lib/ownership.
//
// Business logic (AI-driven discovery/scan/generate/optimize operations,
// and tracked-content-URL sync) lives in server/services/{listicles,
// wikipedia,bofuContent,faqs,trackedContentSync}.ts (phase B7-13). Handlers
// here only parse/validate input, enforce ownership, call one service
// function, and shape the response.

import type { Express } from "express";
import { storage } from "../storage";
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
import { aiLimitMiddleware, sendError, asyncHandler } from "../lib/routesShared";
import { enforceFeatureCooldownOr429 } from "../lib/rateLimitBuckets";
import { hasEnoughBrandProfile } from "../lib/brandProfileCompleteness";
import { loadBrandGenerationContext } from "../lib/brandGenerationContext";
import { registerLlmJobHandler } from "../lib/llmJobs";

import { syncTrackedContentUrl } from "../services/trackedContentSync";
import { discoverBrandListicles } from "../services/listicles";
import { scanBrandWikipediaMentions, draftWikipediaMention } from "../services/wikipedia";
import { generateBofuContent } from "../services/bofuContent";
import {
  faqGenerationFinalize,
  optimizeFaq,
  generateFaqs,
  recomputeAiSurfaceScoreForEdit,
  type FaqGenerationPayload,
} from "../services/faqs";

registerLlmJobHandler<
  FaqGenerationPayload,
  {
    data: unknown[];
    report: {
      requested: number;
      generated: number;
      inserted: number;
      mergedDuplicates: number;
      invalid: number;
    };
    tips: string[];
  }
>({
  kind: "faq_generation",
  finalize: faqGenerationFinalize,
});

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
    // Outreach lifecycle.
    "outreachStatus",
    "outreachNotes",
    "metadata",
  ] as const;
  const LISTICLE_OUTREACH_STATUSES = new Set(["new", "contacted", "won", "dropped"]);

  // Get listicles for a brand - :brandId app.param checks ownership.
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
        if (typeof brandId === "string" && brandId) {
          await requireBrand(brandId, user.id);
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

  // Create a listicle. brandId must belong to the caller. Use
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

  // Update a listicle - ownership required.
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
        // Validate outreach status transitions. Categorical
        // column, not a strict state machine - users can correct mistakes
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

  // Delete a listicle - ownership required.
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

        // Preflight: surface env + profile gaps with actionable messages so
        // the GEO Assets toast tells the user WHY discovery would have run
        // empty, instead of swallowing it as "Failed to discover listicles".
        // listicleScanner.ts:76 throws "OPENROUTER_API_KEY not configured"
        // when the key is absent; sendError() then masks the reason. And
        // buildQueries() returns [] for brands without industry/products,
        // making the scan "succeed" with 0 candidates. Catch both here.
        if (!process.env.OPENROUTER_API_KEY) {
          return res.status(503).json({
            success: false,
            error: "Listicle discovery requires OPENROUTER_API_KEY. Contact support.",
          });
        }
        const listicleHasProfile = hasEnoughBrandProfile(brand);
        if (!listicleHasProfile) {
          return res.status(400).json({
            success: false,
            error: "Add industry or products to your brand profile to discover listicles.",
          });
        }

        if (
          await enforceFeatureCooldownOr429(
            res,
            "discover-listicles",
            brand.id,
            "Listicle discovery",
          )
        ) {
          return;
        }

        const data = await discoverBrandListicles(brand.id, brand.name);

        res.json({ success: true, data });
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
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const mentions = await storage.getWikipediaMentions(req.params.brandId);
        res.json({ success: true, data: mentions });
      } catch (error) {
        sendError(res, error, "Failed to fetch Wikipedia mentions");
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

  // Create a Wikipedia mention. brandId must belong to the caller.
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

  // Scan for Wikipedia opportunities - real MediaWiki API + LLM classification.
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

        // Preflight: wikipediaScanner uses OpenAI (not OpenRouter) for the
        // classifier and the MediaWiki API for search. If OPENAI_API_KEY is
        // missing classifyPages throws a 401-shape error that sendError
        // masks. If buildSearchTerms returns [] (no name/industry/products)
        // the scan "succeeds" with 0 candidates.
        if (!process.env.OPENAI_API_KEY) {
          return res.status(503).json({
            success: false,
            error: "Wikipedia scan requires OPENAI_API_KEY. Contact support.",
          });
        }
        const wikiHasProfile = hasEnoughBrandProfile(brand, { requireName: true });
        if (!wikiHasProfile) {
          return res.status(400).json({
            success: false,
            error: "Add industry or products to your brand profile to scan Wikipedia.",
          });
        }

        if (await enforceFeatureCooldownOr429(res, "scan-wikipedia", brand.id, "Wikipedia scan")) {
          return;
        }

        const data = await scanBrandWikipediaMentions(brand.id, brand.name);

        res.json({ success: true, data });
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
          await requireBrand(brandId, user.id);
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

  // Create BOFU content - brandId ownership required.
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

  // Update BOFU content - ownership required.
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
        // When the user marks the piece as published, this toggles
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

  // Delete BOFU content - ownership required.
  app.delete(
    "/api/bofu-content/:id",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBofuContent(req.params.id, user.id);
        const deleted = await storage.deleteBofuContent(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: "Content not found" });
        // Remove it from the tracked content registry. This is a no-op if it
        // wasn't published).
        await storage.deleteTrackedContentUrlBySource("bofu", req.params.id).catch(() => {});
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to delete BOFU content");
      }
    }),
  );

  // Generate BOFU content using AI - ownership required.
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

        const result = await generateBofuContent({ brandId, contentType, comparedWith, keyword });
        if (result.kind === "not_found") {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        if (result.kind === "invalid_type") {
          return res.status(400).json({ success: false, error: "Invalid content type" });
        }

        res.json({
          success: true,
          data: result.data,
          tips: result.tips,
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
          await requireBrand(brandId, user.id);
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

  // Create FAQ - brandId ownership required.
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

  // Update FAQ - ownership required.
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
        // Recompute aiSurfaceScore deterministically when the
        // question or answer changes. The legacy LLM-self-scored field
        // produced inconsistent values; this gives a stable signal.
        if (update.question !== undefined || update.answer !== undefined) {
          const recomputed = await recomputeAiSurfaceScoreForEdit(req.params.id, update);
          if (recomputed !== undefined) {
            update.aiSurfaceScore = recomputed;
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

  // Delete FAQ - ownership required.
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

  // Optimize a single FAQ for AI citation - ownership required.
  app.post(
    "/api/faqs/:id/optimize",
    aiLimitMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const faq = await requireFaq(req.params.id, user.id);

        const result = await optimizeFaq(faq);
        if (result.kind === "parse_error") {
          return res
            .status(502)
            .json({ success: false, error: "Failed to parse optimization result" });
        }

        res.json({ success: true, data: result.faq });
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
        // Ownership is checked above. Load the grounding context.
        const ctx = await loadBrandGenerationContext(req.params.brandId, []);
        if (!ctx) return res.status(404).json({ success: false, error: "Brand not found" });
        const { brand, facts } = ctx;

        if (await enforceFeatureCooldownOr429(res, "generate-faqs", brand.id, "FAQ generation")) {
          return;
        }

        const { topic, count = 5 } = req.body;

        // Vercel-Hobby-safe: enqueue an OpenAI Responses background
        // job. Kickoff returns instantly with a jobId. The handler
        // registered above (kind="faq_generation") parses the output,
        // dedups against existing FAQs, persists rows, and returns the
        // { data, report, tips } shape the client renders.
        const result = await generateFaqs({ brand, facts, topic, count, userId: user.id });
        if (result.kind === "ai_error") {
          return res.status(result.status).json(result.body);
        }
        if (result.kind === "service_error") {
          return res
            .status(502)
            .json({ success: false, error: "AI service error. Please try again shortly." });
        }

        return res.status(202).json({
          success: true,
          jobId: result.jobId,
          status: result.status,
          pollUrl: `/api/llm-jobs/${result.jobId}`,
          message: "Generating FAQs - usually 10-25s.",
        });
      } catch (error) {
        sendError(res, error, "Failed to generate FAQs");
      }
    }),
  );

  // ============================================================
  // GEO Tools header summary endpoint.
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
  // Wikipedia draft-text helper. It returns a neutral two- or three-sentence
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

        const result = await draftWikipediaMention(mention, mention.brandId);
        if (!result) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        res.json({ success: true, data: result });
      } catch (error) {
        sendError(res, error, "Failed to draft Wikipedia mention");
      }
    }),
  );
}
