// Keyword research/discovery/suggestion business logic extracted from
// server/routes/content.ts (phase B7-13). Pure functions: explicit
// parameters in, plain data out. No Express types, no req/res.

import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import { openai, safeParseJson } from "../lib/routesShared";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { enqueueLlmJob, classifyAiEnqueueError } from "../lib/llmJobs";

// ─────────────────────────────────────────────────────────────────────────
// Keyword discovery handler - registered at module-load. The poll endpoint
// in routes/llmJobs.ts dispatches to this handler when the OpenAI Responses
// background run completes. The handler is responsible for:
//   - validating the structured output
//   - deduping against existing rows
//   - persisting brand-keyword rows
//   - returning the lean result the client renders
// ─────────────────────────────────────────────────────────────────────────
export interface KeywordDiscoveryPayload {
  brandId: string;
}

export interface DiscoveredKeyword {
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  opportunityScore?: number;
  aiCitationPotential?: number;
  intent?: string;
  category?: string | null;
  competitorGap?: number;
  suggestedContentType?: string;
  relatedKeywords?: string[];
}

export async function keywordDiscoveryFinalize({
  payload,
  structuredOutput,
  outputText,
}: {
  payload: KeywordDiscoveryPayload;
  structuredOutput: unknown;
  outputText: string;
}): Promise<{ data: unknown[]; count: number; message?: string }> {
  // Tolerate both shapes the model historically returned:
  // either { keywords: [...] } or a bare [...] array.
  const parsed = structuredOutput as
    { keywords?: DiscoveredKeyword[] } | DiscoveredKeyword[] | null;
  const keywords: DiscoveredKeyword[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.keywords)
      ? parsed.keywords
      : [];

  if (keywords.length === 0) {
    throw new Error(
      outputText && outputText.length > 0
        ? "AI returned an unexpected response shape (no keywords[])."
        : "AI returned an empty response.",
    );
  }

  // Dedup against existing keyword_research rows.
  const existingKeywords = await storage.getKeywordResearch(payload.brandId, {});
  const existingSet = new Set(existingKeywords.map((k) => k.keyword.trim().toLowerCase()));

  const savedKeywords: unknown[] = [];
  for (const kw of keywords) {
    if (!kw || typeof kw.keyword !== "string" || !kw.keyword.trim()) continue;
    const normalized = kw.keyword.trim().toLowerCase();
    if (existingSet.has(normalized)) continue;
    existingSet.add(normalized);
    const saved = await storage.createKeywordResearch({
      brandId: payload.brandId,
      keyword: kw.keyword.trim(),
      searchVolume: typeof kw.searchVolume === "number" ? kw.searchVolume : null,
      difficulty: typeof kw.difficulty === "number" ? kw.difficulty : null,
      opportunityScore: typeof kw.opportunityScore === "number" ? kw.opportunityScore : 50,
      aiCitationPotential: typeof kw.aiCitationPotential === "number" ? kw.aiCitationPotential : 50,
      intent: kw.intent || "informational",
      category: kw.category || null,
      competitorGap: typeof kw.competitorGap === "number" ? kw.competitorGap : 0,
      suggestedContentType: kw.suggestedContentType || "article",
      relatedKeywords: Array.isArray(kw.relatedKeywords) ? kw.relatedKeywords : null,
      status: "discovered",
      provenance: "ai-estimate",
      contentGenerated: 0,
      articleId: null,
    });
    savedKeywords.push(saved);
  }

  if (savedKeywords.length === 0) {
    // Soft case: all returned keywords matched existing rows.
    return {
      data: [],
      count: 0,
      message:
        "No new keywords found - try completing your brand profile (description, products, target audience) for better results.",
    };
  }

  return { data: savedKeywords, count: savedKeywords.length };
}

export type KeywordSuggestionsResult =
  { kind: "ok"; suggestions: string[] } | { kind: "error"; message: string };

export async function suggestKeywords(
  input: string,
  industry: string,
): Promise<KeywordSuggestionsResult> {
  try {
    const response = await openai.chat.completions.create({
      model: MODELS.keywordSuggestions,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a keyword research expert. Return a JSON object of the shape {"suggestions": ["keyword 1", "keyword 2", ...]} with 6-8 short keyword phrases relevant to the user's input and industry. Only output valid JSON, nothing else.`,
        },
        {
          role: "user",
          content: `Input: "${input}"\nIndustry: ${industry}\n\nReturn {"suggestions": [6-8 short keyword phrases]}`,
        },
      ],
      max_tokens: 300,
    });

    const rawContent = response.choices[0].message.content;
    const parsed = safeParseJson<{ suggestions?: unknown } | string[]>(rawContent);
    let suggestions: string[] = [];
    if (Array.isArray(parsed)) {
      suggestions = parsed.filter((s): s is string => typeof s === "string");
    } else if (parsed && Array.isArray((parsed as any).suggestions)) {
      suggestions = ((parsed as any).suggestions as unknown[]).filter(
        (s): s is string => typeof s === "string",
      );
    }

    return { kind: "ok", suggestions: suggestions.slice(0, 8) };
  } catch (error) {
    logger.error({ err: error }, "Keyword suggestion error");
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    captureAndFlush(error, { tags: { source: "content.ts:541" } });
    return { kind: "error", message: errorMessage };
  }
}

export type PopularTopicsResult =
  { kind: "ok"; topics: unknown[] } | { kind: "error"; topics: unknown[] };

export async function getPopularTopics(industry: unknown): Promise<PopularTopicsResult> {
  try {
    const response = await openai.chat.completions.create({
      model: MODELS.popularTopics,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a trend analyst expert. Return a JSON object of the shape {"topics": [{"topic": "...", "description": "...", "category": "..."}, ...]} with 6-8 trending topics. Only output valid JSON, nothing else.`,
        },
        {
          role: "user",
          content: `Industry: ${industry}\n\nReturn {"topics": [6-8 current trending topics valuable for content creators in 2026]}.`,
        },
      ],
      max_tokens: 600,
    });

    const rawContent = response.choices[0].message.content;
    const parsed = safeParseJson<{ topics?: unknown } | unknown[]>(rawContent);
    let topics: any[] = [];
    if (Array.isArray(parsed)) {
      topics = parsed;
    } else if (parsed && Array.isArray((parsed as any).topics)) {
      topics = (parsed as any).topics;
    }

    if (topics.length === 0) {
      topics = [
        {
          topic: "Industry Innovation",
          description: "Latest trends and developments",
          category: "General",
        },
      ];
    }

    return { kind: "ok", topics: topics.slice(0, 8) };
  } catch (error) {
    logger.error({ err: error }, "Popular topics error");
    return {
      kind: "error",
      topics: [{ topic: "Industry Innovation", description: "Latest trends", category: "General" }],
    };
  }
}

export type DiscoverBrandKeywordsResult =
  | { kind: "enqueued"; jobId: string; status: string }
  | { kind: "ai_error"; status: number; body: unknown }
  | { kind: "timeout" }
  | { kind: "service_error" };

interface BrandForKeywordDiscovery {
  id: string;
  name: string;
  companyName: string;
  industry: string | null;
  description: string | null;
  products: string[] | null;
  targetAudience: string | null;
}

// Vercel-Hobby-safe: enqueue a background LLM job instead of
// waiting inline. The OpenAI Responses run executes on OpenAI's
// infrastructure (background:true, store:true) and the client
// polls /api/llm-jobs/:id. Both the kickoff and each poll fit
// in <1s of function time, so even with a 6s budget the user
// gets through 10–20s of effective LLM work.
export async function discoverBrandKeywords(
  brand: BrandForKeywordDiscovery,
  userId: string,
): Promise<DiscoverBrandKeywordsResult> {
  const competitors = await storage.getCompetitors(brand.id);
  const competitorContext =
    competitors.length > 0 ? `Competitors: ${competitors.map((c) => c.name).join(", ")}.` : "";

  const instructions = `You are an expert keyword researcher specializing in AI search optimization (GEO - Generative Engine Optimization). Your goal is to find keywords that will help brands get cited by AI search engines like ChatGPT, Claude, Perplexity, and Google AI.

Return a JSON object of the shape:
{
  "keywords": [
    {
      "keyword": "primary keyword phrase",
      "searchVolume": 1000-50000,
      "difficulty": 1-100,
      "opportunityScore": 1-100,
      "aiCitationPotential": 1-100,
      "intent": "informational" | "commercial" | "transactional" | "navigational",
      "category": "topic category",
      "competitorGap": 0-100,
      "suggestedContentType": "article" | "guide" | "comparison" | "how-to" | "listicle",
      "relatedKeywords": ["related term 1", "related term 2"]
    }
  ]
}

Focus on:
1. Questions AI assistants commonly answer
2. Comparison queries ("X vs Y")
3. "Best of" and recommendation queries
4. How-to and educational content
5. Industry-specific expertise queries`;

  const userPrompt = `Discover 12-15 high-opportunity keywords for this brand:

Brand: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Description: ${brand.description || "Not specified"}
Products/Services: ${brand.products?.join(", ") || "Not specified"}
Target Audience: ${brand.targetAudience || "Not specified"}
${competitorContext}

Find keywords that would help this brand get cited by AI search engines. Prioritize queries where creating authoritative content could establish the brand as a trusted source.`;

  try {
    const job = await enqueueLlmJob<KeywordDiscoveryPayload>({
      kind: "keyword_discovery",
      payload: { brandId: brand.id },
      brandId: brand.id,
      userId,
      model: MODELS.keywordResearch,
      instructions,
      input: userPrompt,
      responseFormat: { type: "json_object" },
    });
    return { kind: "enqueued", jobId: job.jobId, status: job.status };
  } catch (aiErr: unknown) {
    const e = aiErr as { status?: number; name?: string };
    const mapped = classifyAiEnqueueError(e);
    if (mapped) return { kind: "ai_error", status: mapped.status, body: mapped.body };
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      return { kind: "timeout" };
    }
    return { kind: "service_error" };
  }
}
