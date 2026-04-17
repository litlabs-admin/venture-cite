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
export async function generateBrandPrompts(brand: Brand): Promise<{ saved: any[]; error?: string; generationId?: string }> {
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
    completion = await openai.chat.completions.create({
      model: MODELS.brandPromptGeneration,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a GEO (Generative Engine Optimization) expert. Your job is to generate EXACTLY 10 user questions where the given brand is most likely to be cited if those questions were asked to ChatGPT, Claude, or Gemini.

Rules:
- Mix query types: direct ("best X tools"), comparison ("X vs Y"), how-to, and buyer-intent.
- Each question should be natural — something a real user would type.
- For each question, include a 1-sentence rationale explaining why THIS brand would rank well for it.
- Ground the questions in the brand's industry, products, and published articles.
- Do NOT use the brand name in the questions themselves — users rarely search by brand.

Return JSON: { "prompts": [{ "prompt": "...", "rationale": "..." }, ... 10 items total] }`,
        },
        {
          role: "user",
          content: `Brand: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Description: ${brand.description || 'N/A'}
Target audience: ${brand.targetAudience || 'N/A'}
Products/services: ${Array.isArray(brand.products) ? brand.products.join(', ') : 'N/A'}
Unique selling points: ${Array.isArray(brand.uniqueSellingPoints) ? brand.uniqueSellingPoints.join(', ') : 'N/A'}

Published articles:
${articleSummaries.length === 0 ? '(no articles published yet — base prompts on brand profile only)' : articleSummaries.map((a, i) => `${i + 1}. "${a.title}" — keywords: ${a.keywords.join(', ') || 'none'}`).join('\n')}`,
        },
      ],
      max_tokens: 2000,
    }, { signal: AbortSignal.timeout(45_000) });
  } catch (err: any) {
    return { saved: [], error: err?.message || "AI call failed" };
  }

  const parsed = safeParseJson<{ prompts?: Array<{ prompt: string; rationale?: string }> }>(completion.choices[0].message.content);
  const promptList = Array.isArray(parsed?.prompts) ? parsed!.prompts : [];
  const valid = promptList.filter((p) => p && typeof p.prompt === 'string' && p.prompt.trim().length > 0).slice(0, 10);
  if (valid.length === 0) {
    return { saved: [], error: "AI returned no usable prompts" };
  }

  // Archive existing prompts (soft delete) and create a new generation.
  await storage.archiveBrandPrompts(brand.id);
  const generation = await storage.createPromptGeneration(brand.id);

  const saved = [];
  for (let i = 0; i < valid.length; i += 1) {
    const row = await storage.createBrandPrompt({
      brandId: brand.id,
      generationId: generation.id,
      prompt: valid[i].prompt.trim(),
      rationale: valid[i].rationale?.trim() || null,
      orderIndex: i,
      isActive: 1,
      status: "tracked",
    } as any);
    saved.push(row);
  }

  return { saved, generationId: generation.id };
}
