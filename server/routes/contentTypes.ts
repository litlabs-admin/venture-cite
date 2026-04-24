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
import { openai, aiLimitMiddleware, sendError, safeParseJson } from "../lib/routesShared";

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
    "metadata",
  ] as const;

  // Get listicles for a brand — :brandId app.param checks ownership.
  app.get("/api/listicles/:brandId", async (req, res) => {
    try {
      const listicles = await storage.getListicles(req.params.brandId);
      res.json({ success: true, data: listicles });
    } catch (error) {
      sendError(res, error, "Failed to fetch listicles");
    }
  });

  // List listicles across user's brands (with optional brandId filter).
  app.get("/api/listicles", async (req, res) => {
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
  });

  // Create a listicle — brandId must belong to caller.
  app.post("/api/listicles", async (req, res) => {
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
      const listicle = await storage.createListicle(body as any);
      res.json({ success: true, data: listicle });
    } catch (error) {
      sendError(res, error, "Failed to create listicle");
    }
  });

  // Update a listicle — ownership required.
  app.patch("/api/listicles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireListicle(req.params.id, user.id);
      const update = pickFields<any>(req.body, LISTICLE_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const listicle = await storage.updateListicle(req.params.id, update as any);
      if (!listicle) return res.status(404).json({ success: false, error: "Listicle not found" });
      res.json({ success: true, data: listicle });
    } catch (error) {
      sendError(res, error, "Failed to update listicle");
    }
  });

  // Delete a listicle — ownership required.
  app.delete("/api/listicles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireListicle(req.params.id, user.id);
      const deleted = await storage.deleteListicle(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Listicle not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete listicle");
    }
  });

  // Discover listicles for a brand using AI
  app.post("/api/listicles/discover/:brandId", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand || brand.userId !== user.id) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      const { scanBrandListicles } = await import("../lib/listicleScanner");
      const result = await scanBrandListicles(brand.id);
      const listicles = await storage.getListicles(brand.id);

      res.json({
        success: true,
        data: {
          brand: { id: brand.id, name: brand.name },
          inserted: result.inserted,
          candidates: result.candidates,
          reason: result.reason,
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
  });

  // ========== WIKIPEDIA MONITOR ==========

  // Get Wikipedia mentions for a brand
  app.get("/api/wikipedia/:brandId", async (req, res) => {
    try {
      const mentions = await storage.getWikipediaMentions(req.params.brandId);
      res.json({ success: true, data: mentions });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch Wikipedia mentions" });
    }
  });

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

  // Create Wikipedia mention — brandId must belong to caller.
  app.post("/api/wikipedia", async (req, res) => {
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
      const mention = await storage.createWikipediaMention(body as any);
      res.json({ success: true, data: mention });
    } catch (error) {
      sendError(res, error, "Failed to create Wikipedia mention");
    }
  });

  // Scan for Wikipedia opportunities — real MediaWiki API + LLM classification.
  app.post("/api/wikipedia/scan/:brandId", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      const { scanBrandWikipedia } = await import("../lib/wikipediaScanner");
      const result = await scanBrandWikipedia(brand.id);
      const mentions = await storage.getWikipediaMentions(brand.id);

      res.json({
        success: true,
        data: {
          brand: { id: brand.id, name: brand.name },
          existing: result.existing,
          opportunities: result.opportunities,
          inserted: result.inserted,
          mentions,
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to scan Wikipedia");
    }
  });

  // ========== BOFU CONTENT GENERATOR ==========

  // Get BOFU content for a brand
  app.get("/api/bofu-content/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const contentType = req.query.contentType as string;
      const content = await storage.getBofuContent(brandId, contentType);
      res.json({ success: true, data: content });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch BOFU content" });
    }
  });

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
    "metadata",
  ] as const;

  app.get("/api/bofu-content", async (req, res) => {
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
  });

  // Create BOFU content — brandId ownership required.
  app.post("/api/bofu-content", async (req, res) => {
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
  });

  // Update BOFU content — ownership required.
  app.patch("/api/bofu-content/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBofuContent(req.params.id, user.id);
      const update = pickFields<any>(req.body, BOFU_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const content = await storage.updateBofuContent(req.params.id, update as any);
      if (!content) return res.status(404).json({ success: false, error: "Content not found" });
      res.json({ success: true, data: content });
    } catch (error) {
      sendError(res, error, "Failed to update BOFU content");
    }
  });

  // Delete BOFU content — ownership required.
  app.delete("/api/bofu-content/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBofuContent(req.params.id, user.id);
      const deleted = await storage.deleteBofuContent(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Content not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete BOFU content");
    }
  });

  // Generate BOFU content using AI — ownership required.
  app.post("/api/bofu-content/generate", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, contentType, comparedWith, keyword } = req.body ?? {};
      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      const brand = await requireBrand(brandId, user.id);

      let prompt = "";
      let title = "";

      if (contentType === "comparison") {
        const competitor = comparedWith?.[0] || "Competitor";
        title = `${brand.name} vs ${competitor}: Complete Comparison Guide`;
        prompt = `Create a comprehensive comparison article: "${title}"

Brand: ${brand.name}
Industry: ${brand.industry}
Description: ${brand.description || ""}
Key Products/Services: ${brand.products?.join(", ") || ""}
Unique Selling Points: ${brand.uniqueSellingPoints?.join(", ") || ""}

Create an in-depth, balanced comparison (1500+ words) that:
1. Compares features, pricing, pros/cons objectively
2. Helps readers make an informed decision
3. Is optimized for AI citation (structured with headers, tables, clear conclusions)
4. Includes a FAQ section at the end

Format with markdown headers. Be balanced but highlight genuine strengths of ${brand.name}.`;
      } else if (contentType === "alternatives") {
        const to = comparedWith?.[0] || "Industry Leader";
        title = `Top ${brand.name} Alternatives: Best Options for ${new Date().getFullYear()}`;
        prompt = `Create an "Alternatives to ${to}" article that positions ${brand.name} as a top alternative.

Brand: ${brand.name}
Industry: ${brand.industry}

Create a comprehensive alternatives guide (1500+ words) that:
1. Lists 5-7 alternatives (including ${brand.name})
2. Explains why someone might look for alternatives
3. Compares each alternative with pros/cons
4. Positions ${brand.name} favorably but honestly
5. Includes FAQ section for AI indexing

Format with markdown. Each alternative should have clear headers and bullet points.`;
      } else if (contentType === "guide") {
        title = keyword
          ? `${keyword}: Complete Guide for ${new Date().getFullYear()}`
          : `${brand.industry} Buying Guide`;
        prompt = `Create a transactional buying guide for ${brand.industry}.

Brand: ${brand.name}
Target Keyword: ${keyword || brand.industry + " guide"}

Create a comprehensive buyer's guide (1500+ words) that:
1. Helps buyers understand what to look for
2. Explains key features and considerations
3. Naturally mentions ${brand.name} as a solution
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
        aiScore: 85,
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
  });

  // ========== FAQ OPTIMIZER ==========

  // Get FAQ items
  app.get("/api/faqs/:brandId", async (req, res) => {
    try {
      const faqs = await storage.getFaqItems(req.params.brandId);
      res.json({ success: true, data: faqs });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch FAQs" });
    }
  });

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
    "metadata",
  ] as const;

  app.get("/api/faqs", async (req, res) => {
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
  });

  // Create FAQ — brandId ownership required.
  app.post("/api/faqs", async (req, res) => {
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
        return res.status(400).json({ success: false, error: "question and answer are required" });
      }
      const faq = await storage.createFaqItem(body as any);
      res.json({ success: true, data: faq });
    } catch (error) {
      sendError(res, error, "Failed to create FAQ");
    }
  });

  // Update FAQ — ownership required.
  app.patch("/api/faqs/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireFaq(req.params.id, user.id);
      const update = pickFields<any>(req.body, FAQ_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const faq = await storage.updateFaqItem(req.params.id, update as any);
      if (!faq) return res.status(404).json({ success: false, error: "FAQ not found" });
      res.json({ success: true, data: faq });
    } catch (error) {
      sendError(res, error, "Failed to update FAQ");
    }
  });

  // Delete FAQ — ownership required.
  app.delete("/api/faqs/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireFaq(req.params.id, user.id);
      const deleted = await storage.deleteFaqItem(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "FAQ not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete FAQ");
    }
  });

  // Optimize a single FAQ for AI citation — ownership required.
  app.post("/api/faqs/:id/optimize", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const faq = await requireFaq(req.params.id, user.id);

      // Get brand context
      let brandContext = "";
      if (faq.brandId) {
        const brand = await storage.getBrandById(faq.brandId);
        if (brand) {
          brandContext = `Brand: ${brand.name}, Industry: ${brand.industry}, Products: ${brand.products?.join(", ") || "N/A"}`;
        }
      }

      const prompt = `You are an FAQ optimization expert for AI search engines. Optimize this FAQ for maximum AI citation likelihood.

Current FAQ:
Question: ${faq.question}
Answer: ${faq.answer}

Brand Context: ${brandContext}

Optimization requirements:
1. Question should be natural and mirror how users ask AI chatbots
2. Answer should be 40-60 words (optimal for AI summarization)
3. Answer should start with a direct response, then provide context
4. Include specific facts, numbers, or unique value props if applicable
5. Make it authoritative but conversational

Return JSON:
{
  "question": "Optimized question",
  "answer": "Optimized answer (40-60 words)",
  "aiSurfaceScore": 1-100,
  "optimizationTips": ["What was improved", "Additional suggestions"]
}

Return ONLY valid JSON.`;

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

      const updatedFaq = await storage.updateFaqItem(req.params.id, {
        question: optimized.question || faq.question,
        answer: optimized.answer || faq.answer,
        aiSurfaceScore: optimized.aiSurfaceScore || 85,
        isOptimized: 1,
        optimizationTips: Array.isArray(optimized.optimizationTips)
          ? optimized.optimizationTips
          : [],
      });

      res.json({ success: true, data: updatedFaq });
    } catch (error) {
      sendError(res, error, "Failed to optimize FAQ");
    }
  });

  // Generate optimized FAQs for a brand
  app.post("/api/faqs/generate/:brandId", aiLimitMiddleware, async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }

      const { topic, count = 5 } = req.body;
      const faqCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);

      const prompt = `You are an FAQ optimization expert for AI search engines. Generate exactly ${faqCount} FAQs for ${brand.name} (${brand.industry}).

Topic focus: ${topic || brand.industry}
Company description: ${brand.description || ""}
Products/Services: ${brand.products?.join(", ") || ""}

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
  "aiSurfaceScore": 1-100 (how likely AI will surface this),
  "optimizationTips": ["tip1", "tip2"]
}]

Return ONLY the JSON array.`;

      const response = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });

      const parsed = safeParseJson<any[]>(response.choices[0].message.content);
      const faqs: any[] = Array.isArray(parsed) ? parsed : [];

      // Save sequentially with per-item try/catch so one bad item doesn't
      // abort the whole batch (fixes the Promise.all partial-failure bug).
      const savedFaqs: any[] = [];
      for (const faq of faqs) {
        if (!faq || typeof faq.question !== "string" || typeof faq.answer !== "string") continue;
        try {
          const saved = await storage.createFaqItem({
            brandId: brand.id,
            question: faq.question,
            answer: faq.answer,
            category: faq.category ?? null,
            aiSurfaceScore: typeof faq.aiSurfaceScore === "number" ? faq.aiSurfaceScore : null,
            isOptimized: 1,
            optimizationTips: Array.isArray(faq.optimizationTips) ? faq.optimizationTips : [],
          });
          savedFaqs.push(saved);
        } catch (err) {
          console.warn("[faqs] createFaqItem failed for one item:", err);
        }
      }

      res.json({
        success: true,
        data: savedFaqs,
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
  });
}
