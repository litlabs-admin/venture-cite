import OpenAI from "openai";
import { storage } from "../storage";
import { MODELS } from "./modelConfig";
import { attachAiLogger } from "./aiLogger";
import type { Brand, BrandPrompt } from "@shared/schema";

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

// Stopwords for the Jaccard similarity check — intentionally tiny, just the
// filler tokens that inflate overlap without carrying intent.
const STOPWORDS = new Set([
  "the","a","an","is","are","and","to","for","of","in","with","my","your",
  "how","what","which","best","top","do","does","can","should","when","where",
  "on","at","by","as","i","we","you","or","be","from","about","that","this",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  Array.from(a).forEach((tok) => { if (b.has(tok)) overlap += 1; });
  return overlap / (a.size + b.size - overlap);
}

const SIMILARITY_THRESHOLD = 0.6;
const TARGET_SUGGESTIONS = 5;

async function callSuggestionLLM(
  brand: Brand,
  tracked: BrandPrompt[],
  avoidList: string[],
  howMany: number,
): Promise<Array<{ prompt: string; rationale?: string }>> {
  const recentArticles = await storage.getRecentArticlesByBrandId(brand.id, 10);
  const articleSummaries = recentArticles.map((a) => ({
    title: a.title,
    keywords: Array.isArray(a.keywords) ? a.keywords.slice(0, 5) : [],
  }));

  const trackedList = tracked.map((p, i) => `${i + 1}. ${p.prompt}`).join("\n");
  const avoidBlock = avoidList.length > 0
    ? `\n\nPreviously rejected (too similar to tracked) — avoid these shapes too:\n${avoidList.map((p, i) => `- ${p}`).join("\n")}`
    : "";

  const completion = await openai.chat.completions.create({
    model: MODELS.brandPromptGeneration,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a GEO (Generative Engine Optimization) expert. The user already tracks 10 fixed questions weekly — your job is to propose NEW candidate questions that cover different angles, personas, or buying-journey stages.

Rules:
- Each question must be something a real user would type into ChatGPT, Claude, or Gemini.
- Do NOT rephrase any tracked question. Do not make near-duplicates (e.g. "best X for Y" → "top X for Y" is forbidden).
- Cover gaps: different intent (comparison vs. how-to vs. buyer), different personas, or different journey stages (awareness/consideration/decision).
- Do NOT use the brand name in the questions themselves.
- Include a 1-sentence rationale per question explaining the gap it fills.

Return JSON: { "prompts": [{ "prompt": "...", "rationale": "..." }, ... exactly ${howMany} items] }`,
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

Currently tracked questions (do NOT duplicate or rephrase):
${trackedList || "(none)"}${avoidBlock}

Published articles (for topic grounding):
${articleSummaries.length === 0 ? "(none yet)" : articleSummaries.map((a, i) => `${i + 1}. "${a.title}" — ${a.keywords.join(", ") || "no keywords"}`).join("\n")}

Return exactly ${howMany} NEW, distinct questions as JSON.`,
      },
    ],
    max_tokens: 1200,
  }, { signal: AbortSignal.timeout(45_000) });

  const parsed = safeParseJson<{ prompts?: Array<{ prompt: string; rationale?: string }> }>(
    completion.choices[0]?.message?.content,
  );
  const list = Array.isArray(parsed?.prompts) ? parsed!.prompts : [];
  return list.filter((p) => p && typeof p.prompt === "string" && p.prompt.trim().length > 0);
}

/**
 * Generate up to 5 new suggested prompts for a brand, filtering any that
 * overlap too heavily with the tracked set. Writes survivors as
 * `status = "suggested"` rows. Safe to call on a brand with no tracked
 * prompts — returns [] in that case because the user should seed first.
 */
export async function generateSuggestedPrompts(
  brandId: string,
  opts: { replaceExisting?: boolean } = {},
): Promise<{ saved: BrandPrompt[]; error?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { saved: [], error: "OPENAI_API_KEY not configured" };
  }

  const brand = await storage.getBrandById(brandId);
  if (!brand) return { saved: [], error: "Brand not found" };

  const tracked = await storage.getBrandPromptsByBrandId(brandId, { status: "tracked" });
  if (tracked.length === 0) {
    return { saved: [], error: "Seed tracked prompts before requesting suggestions" };
  }

  if (opts.replaceExisting) {
    await storage.archiveSuggestedPrompts(brandId);
  }

  const trackedTokens = tracked.map((p) => tokenize(p.prompt));

  // First pass.
  let candidates: Array<{ prompt: string; rationale?: string }> = [];
  try {
    candidates = await callSuggestionLLM(brand, tracked, [], TARGET_SUGGESTIONS);
  } catch (err: any) {
    return { saved: [], error: err?.message || "Suggestion AI call failed" };
  }

  const survivors: Array<{ prompt: string; rationale?: string }> = [];
  const rejected: string[] = [];
  for (const c of candidates) {
    const tokens = tokenize(c.prompt);
    const tooSimilar = trackedTokens.some((tt) => jaccard(tokens, tt) >= SIMILARITY_THRESHOLD);
    const dupeInBatch = survivors.some((s) => jaccard(tokenize(s.prompt), tokens) >= SIMILARITY_THRESHOLD);
    if (tooSimilar || dupeInBatch) {
      rejected.push(c.prompt);
    } else {
      survivors.push(c);
    }
  }

  // Top up with a single retry if we dropped too many.
  if (survivors.length < TARGET_SUGGESTIONS) {
    const shortfall = TARGET_SUGGESTIONS - survivors.length;
    try {
      const retry = await callSuggestionLLM(brand, tracked, [...rejected, ...survivors.map((s) => s.prompt)], shortfall);
      for (const c of retry) {
        if (survivors.length >= TARGET_SUGGESTIONS) break;
        const tokens = tokenize(c.prompt);
        const tooSimilar = trackedTokens.some((tt) => jaccard(tokens, tt) >= SIMILARITY_THRESHOLD);
        const dupeInBatch = survivors.some((s) => jaccard(tokenize(s.prompt), tokens) >= SIMILARITY_THRESHOLD);
        if (!tooSimilar && !dupeInBatch) survivors.push(c);
      }
    } catch {
      // retry failure is non-fatal — persist what we have.
    }
  }

  if (survivors.length === 0) {
    return { saved: [], error: "Every candidate overlapped with the tracked set" };
  }

  const saved: BrandPrompt[] = [];
  for (let i = 0; i < survivors.length; i += 1) {
    const row = await storage.createBrandPrompt({
      brandId,
      generationId: null,
      prompt: survivors[i].prompt.trim(),
      rationale: survivors[i].rationale?.trim() || null,
      orderIndex: i,
      isActive: 1,
      status: "suggested",
    } as any);
    saved.push(row);
  }

  return { saved };
}
