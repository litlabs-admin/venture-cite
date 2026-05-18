import OpenAI from "openai";
import { storage } from "../storage";
import { MODELS } from "./modelConfig";
import { attachAiLogger } from "./aiLogger";
import type { Brand } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

/**
 * Generate 10 fresh citation prompts for a brand and persist them,
 * replacing any existing prompts. Shared between the API handler and
 * the auto-citation scheduler.
 */
export async function generateBrandPrompts(
  brand: Brand,
): Promise<{ saved: any[]; error?: string; generationId?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { saved: [], error: "OPENAI_API_KEY not configured" };
  }

  const recentArticles = await storage.getRecentArticlesByBrandId(brand.id, 10);
  const articleSummaries = recentArticles.map((a) => ({
    title: a.title,
    keywords: Array.isArray(a.keywords) ? a.keywords.slice(0, 5) : [],
  }));

  let completion;
  try {
    completion = await openai.chat.completions.create(
      {
        model: MODELS.brandPromptGeneration,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a GEO (Generative Engine Optimization) strategist. Generate EXACTLY 10 distinct questions a real person would type into ChatGPT, Claude, Gemini, or Perplexity while researching or buying in this brand's category — questions where a well-informed assistant would naturally name or recommend specific products/companies, so the brand has a genuine chance to be cited.

Rules:
- Real user phrasing only — natural questions people actually ask an AI assistant. No SEO keyword stuffing, no marketing copy.
- The 10 must be genuinely different: distinct topics and intents. Never rephrase or near-duplicate another question.
- Do NOT use the brand's name in the questions — users rarely search by brand, and we want to see whether the brand surfaces unprompted.
- Favor questions where an assistant would enumerate, compare, or recommend options in this category (that is where citations actually happen): "best X for Y", "X vs Y", "top alternatives to Y", "how to choose an X", and other buyer-intent / decision questions.
- Ground every question in the brand's real industry, products, USPs, target audience, and published article topics — not generic filler.
- For each, give a 1-sentence rationale: why an assistant answering THIS question would plausibly name this brand.
- Classify each prompt on TWO dimensions:
  - category: a short topic cluster (2-4 words, lowercase), e.g. "pricing comparison", "getting started", "use case guide"
  - funnelStage: EXACTLY one of "TOFU" (awareness: "what is X", "how does X work"), "MOFU" (consideration: "best X for Y", "how to choose X"), or "BOFU" (decision: "X vs Y", "X pricing", "alternatives to Y")
- Distribution across the 10: exactly 3 TOFU, 4 MOFU, 3 BOFU — buyer-intent MOFU/BOFU questions cite brands far more often, so weight toward them while keeping awareness coverage.

Return JSON only: { "prompts": [{ "prompt": "...", "rationale": "...", "category": "...", "funnelStage": "TOFU"|"MOFU"|"BOFU" }, ... exactly 10 items] }`,
          },
          {
            role: "user",
            content: `Brand: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Description: ${brand.description || "N/A"}
Target audience: ${brand.targetAudience || "N/A"}
Products/services: ${Array.isArray(brand.products) ? brand.products.join(", ") : "N/A"}
Unique selling points: ${Array.isArray(brand.uniqueSellingPoints) ? brand.uniqueSellingPoints.join(", ") : "N/A"}

Published articles:
${articleSummaries.length === 0 ? "(no articles published yet — base prompts on brand profile only)" : articleSummaries.map((a, i) => `${i + 1}. "${a.title}" — keywords: ${a.keywords.join(", ") || "none"}`).join("\n")}`,
          },
        ],
        max_tokens: 2000,
      },
      { signal: AbortSignal.timeout(45_000) },
    );
  } catch (err: any) {
    return { saved: [], error: err?.message || "AI call failed" };
  }

  const parsed = safeParseJson<{
    prompts?: Array<{
      prompt: string;
      rationale?: string;
      category?: string;
      funnelStage?: string;
    }>;
  }>(completion.choices[0].message.content);
  const promptList = Array.isArray(parsed?.prompts) ? parsed!.prompts : [];
  const valid = promptList
    .filter((p) => p && typeof p.prompt === "string" && p.prompt.trim().length > 0)
    .slice(0, 10);
  if (valid.length === 0) {
    return { saved: [], error: "AI returned no usable prompts" };
  }

  // Archive existing prompts (soft delete) and create a new generation.
  await storage.archiveBrandPrompts(brand.id);
  const generation = await storage.createPromptGeneration(brand.id);

  const saved = [];
  for (let i = 0; i < valid.length; i += 1) {
    const rawStage = (valid[i].funnelStage || "").toString().toUpperCase();
    const funnelStage =
      rawStage === "TOFU" || rawStage === "MOFU" || rawStage === "BOFU" ? rawStage : null;
    const category = valid[i].category?.toString().trim().slice(0, 64) || null;
    const row = await storage.createBrandPrompt({
      brandId: brand.id,
      generationId: generation.id,
      prompt: valid[i].prompt.trim(),
      rationale: valid[i].rationale?.trim() || null,
      orderIndex: i,
      isActive: 1,
      status: "tracked",
      category,
      funnelStage,
      region: "global",
    } as any);
    saved.push(row);
  }

  return { saved, generationId: generation.id };
}
