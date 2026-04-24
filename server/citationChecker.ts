import OpenAI from "openai";
import { storage } from "./storage";
import type { GeoRanking, Brand } from "@shared/schema";
import { attachAiLogger } from "./lib/aiLogger";
import { MODELS, OPENROUTER_BASE_URL } from "./lib/modelConfig";
import { judgeCitation, type JudgeBrand } from "./citationJudge";
import { assertWithinBudget, recordSpend, type Tier } from "./lib/llmBudget";
import { logger } from "./lib/logger";
import { openaiBreaker, openrouterBreaker } from "./lib/circuitBreaker";
import { analyzeResponse, deriveSentiment, type TrackedEntity } from "./lib/responseAnalyzer";
import { matchEntity } from "./lib/brandMatcher";

// ChatGPT citation checks go through the direct OpenAI client.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

// Claude / Gemini / Perplexity / DeepSeek all route through OpenRouter so we
// don't have to maintain four separate provider SDKs. OpenRouter is OpenAI
// SDK-compatible — same chat.completions.create shape, just a different
// baseURL and API key.
const openrouter = process.env.OPENROUTER_API_KEY
  ? (() => {
      const client = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: OPENROUTER_BASE_URL,
        timeout: 45_000,
        maxRetries: 1,
      });
      attachAiLogger(client);
      return client;
    })()
  : null;

export const DEFAULT_CITATION_PLATFORMS = [
  "ChatGPT",
  "Perplexity",
  "DeepSeek",
  "Claude",
  "Gemini",
] as const;

// LLM-judged citation detector. The string matcher is only a cheap pre-filter:
// if NO brand variant appears anywhere in the response, skip the LLM call
// (definitely not cited). Otherwise gpt-4o-mini decides, because it can tell
// "venture capital" apart from "Venture PR" using surrounding context.
export async function checkForCitation(
  responseText: string,
  brandName: string,
  extraVariations: string[] = [],
  brandContext?: {
    website?: string | null;
    companyName?: string | null;
    description?: string | null;
    industry?: string | null;
  },
): Promise<{
  isCited: boolean;
  rank: number | null;
  relevance: number | null;
  reasoning?: string;
}> {
  if (!brandName || !responseText) return { isCited: false, rank: null, relevance: null };

  // Stage 1: shared matcher decides presence. Whole-word, possessive-aware,
  // URL-boundary for domains, proximity-gated for short/ambiguous names.
  const matcherResult = matchEntity(responseText, {
    id: "brand",
    name: brandName,
    nameVariations: extraVariations,
    website: brandContext?.website ?? null,
  });
  if (!matcherResult.matched) {
    return {
      isCited: false,
      rank: null,
      relevance: null,
      reasoning: "No brand variant found in response",
    };
  }

  const judgeBrand: JudgeBrand = {
    name: brandName,
    companyName: brandContext?.companyName,
    website: brandContext?.website,
    description: brandContext?.description,
    industry: brandContext?.industry,
    nameVariations: extraVariations,
  };

  try {
    const verdict = await judgeCitation({ responseText, brand: judgeBrand });
    return {
      isCited: verdict.cited,
      rank: verdict.cited ? verdict.rank : null,
      relevance: verdict.relevance,
      reasoning: verdict.reasoning,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[citationChecker] judge call failed —`, msg);
    // Fail closed: if the judge is unreachable, report not cited so we don't
    // leave stale string-matcher false positives behind.
    return { isCited: false, rank: null, relevance: null, reasoning: `Judge error: ${msg}` };
  }
}

// Extract the first URL in a response. Used to populate geo_rankings.citingOutletUrl
// so downstream analytics (opportunities bucketing, top-sources aggregation,
// authority-score derivation) have something to work with.
export function extractFirstUrl(responseText: string): string | null {
  if (!responseText) return null;
  const match = responseText.match(/https?:\/\/[^\s<>()"']+/i);
  if (!match) return null;
  // Strip trailing punctuation
  return match[0].replace(/[.,;:!?)\]]+$/, "");
}

// Classify the origin type from a URL's domain. Powers the "community vs
// reference vs video vs web" breakdown on the Citation Quality dashboard.
export function classifySourceType(url: string | null | undefined): string | null {
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (
    /(^|\.)reddit\.com$|(^|\.)quora\.com$|(^|\.)ycombinator\.com$|stackexchange\.com$|stackoverflow\.com$/.test(
      host,
    )
  ) {
    return "community";
  }
  if (/(^|\.)wikipedia\.org$|(^|\.)britannica\.com$|\.gov$|\.edu$/.test(host)) {
    return "reference";
  }
  if (/(^|\.)youtube\.com$|youtu\.be$|vimeo\.com$|tiktok\.com$/.test(host)) {
    return "video";
  }
  return "web";
}

// Authority score: how often this domain appears in the brand's cited history.
// Capped at 100. Map is built once per run from prior geo_rankings so we don't
// have to query per-task. Unknown domains get a floor of 10 (single occurrence).
export function computeAuthorityScore(
  citingOutletUrl: string | null,
  domainOccurrenceMap: Map<string, number>,
): number | null {
  if (!citingOutletUrl) return null;
  let host = "";
  try {
    host = new URL(citingOutletUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const prior = domainOccurrenceMap.get(host) || 0;
  return Math.min(100, prior * 10 + 10);
}

// Maps each non-ChatGPT citation platform to its OpenRouter model slug.
const OPENROUTER_MODEL_BY_PLATFORM: Record<string, string> = {
  Claude: MODELS.citationClaude,
  Gemini: MODELS.citationGemini,
  Perplexity: MODELS.citationPerplexity,
  DeepSeek: MODELS.citationDeepSeek,
};

// Per-platform query. ChatGPT hits OpenAI directly; the other four go through
// OpenRouter. No simulation fallbacks — if OPENROUTER_API_KEY is missing the
// caller gets a clear context string so the UI can surface it.
//
// userId is optional for legacy callers (e.g. ad-hoc /api/citation/check
// hits where the route already enforces ownership). When provided, the
// LLM call's token spend is recorded against that user's budget.
export async function runPlatformCitationCheck(
  platform: string,
  prompt: string,
  brand: Brand | null,
  brandName: string,
  brandNameVariations: string[] = [],
  website?: string,
  userId?: string,
  opts: { skipJudge?: boolean } = {},
): Promise<{
  isCited: boolean;
  rank: number | null;
  relevance: number | null;
  responseText: string;
  error?: string;
}> {
  const { skipJudge = false } = opts;
  const brandContext = {
    website: website || brand?.website || null,
    companyName: brand?.companyName || null,
    description: brand?.description || null,
    industry: brand?.industry || null,
  };
  const systemMsg =
    "You are a helpful assistant. Answer the question thoroughly, citing specific sources, brands, companies, or products when relevant.";

  if (platform === "ChatGPT" || platform === "GPT-4") {
    const chatResponse = await openaiBreaker.run(() =>
      openai.chat.completions.create({
        model: MODELS.citationChatGPT,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    );
    if (userId) {
      await recordSpend({
        userId,
        service: "openai",
        model: MODELS.citationChatGPT,
        tokensIn: chatResponse.usage?.prompt_tokens ?? 0,
        tokensOut: chatResponse.usage?.completion_tokens ?? 0,
      });
    }
    const responseText = chatResponse.choices[0].message.content || "";
    if (skipJudge) return { isCited: false, rank: null, relevance: null, responseText };
    const r = await checkForCitation(responseText, brandName, brandNameVariations, brandContext);
    return { isCited: r.isCited, rank: r.rank, relevance: r.relevance, responseText };
  }

  const openrouterModel = OPENROUTER_MODEL_BY_PLATFORM[platform];
  if (!openrouterModel) {
    return {
      isCited: false,
      rank: null,
      relevance: null,
      responseText: "",
      error: `Unknown citation platform: ${platform}`,
    };
  }

  if (!openrouter) {
    return {
      isCited: false,
      rank: null,
      relevance: null,
      responseText: "",
      error: `${platform} check skipped — OPENROUTER_API_KEY is not configured.`,
    };
  }

  const chatResponse = await openrouterBreaker.run(() =>
    openrouter!.chat.completions.create({
      model: openrouterModel,
      messages: [
        { role: "system", content: `You are ${platform}, a helpful AI assistant. ${systemMsg}` },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    }),
  );
  if (userId) {
    await recordSpend({
      userId,
      service: "openrouter",
      model: openrouterModel,
      tokensIn: chatResponse.usage?.prompt_tokens ?? 0,
      tokensOut: chatResponse.usage?.completion_tokens ?? 0,
    });
  }
  const responseText = chatResponse.choices[0]?.message?.content || "";
  if (skipJudge) return { isCited: false, rank: null, relevance: null, responseText };
  const r = await checkForCitation(responseText, brandName, brandNameVariations, brandContext);
  return { isCited: r.isCited, rank: r.rank, relevance: r.relevance, responseText };
}

// Runs every stored prompt for a brand across each platform and persists a
// geo_rankings row per (prompt, platform) pair. Shared between the API
// endpoint and the weekly scheduler.
export async function runBrandPrompts(
  brandId: string,
  platforms: string[] = [...DEFAULT_CITATION_PLATFORMS],
  options: {
    triggeredBy?: "manual" | "cron" | "auto_onboarding";
    runId?: string;
    promptIds?: string[];
    onProgress?: (checked: number, total: number) => void | Promise<void>;
  } = {},
): Promise<{
  totalChecks: number;
  totalCited: number;
  rankings: GeoRanking[];
  runId: string | null;
}> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("Brand not found");

  // Wave 3.2: enforce per-user LLM budget. Cron runs and manual triggers
  // both go through here, so blocking here covers both. brand.userId can
  // be null for orphaned/legacy rows; in that case skip the check.
  if (brand.userId) {
    const owner = await storage.getUser(brand.userId);
    const tier = (owner?.accessTier ?? "free") as Tier;
    await assertWithinBudget(brand.userId, tier);
  }

  const brandName = brand.companyName || brand.name || "";
  // Pass every name we know about — short name, company name, and any
  // stored variations — into the detector so "Notion Labs, Inc." also
  // matches a response that just says "Notion".
  const brandNameVariations = [
    brand.name || "",
    brand.companyName || "",
    ...(Array.isArray(brand.nameVariations) ? brand.nameVariations : []),
  ].filter((s) => typeof s === "string" && s.trim().length > 0);
  const allPrompts = await storage.getBrandPromptsByBrandId(brandId);
  const prompts =
    options.promptIds && options.promptIds.length > 0
      ? allPrompts.filter((p) => options.promptIds!.includes(p.id))
      : allPrompts;
  if (prompts.length === 0) return { totalChecks: 0, totalCited: 0, rankings: [], runId: null };

  // Create a citation_runs row upfront so every geo_ranking can reference it.
  const triggeredBy = options.triggeredBy ?? "manual";
  const citationRun = await storage.createCitationRun({
    brandId,
    triggeredBy,
    totalChecks: 0,
    totalCited: 0,
    citationRate: 0,
  });

  const cappedPlatforms = platforms.slice(0, 5);
  const rankings: GeoRanking[] = [];
  let totalCited = 0;

  // Build the domain-occurrence map once per run. Used to compute per-ranking
  // authority_score at insert time. Scans all prior cited geo_rankings for
  // any of this brand's prompts.
  const domainOccurrenceMap = new Map<string, number>();
  try {
    const promptIds = prompts.map((p) => p.id);
    const priorRankings = await storage.getGeoRankingsByBrandPromptIds(promptIds);
    for (const r of priorRankings) {
      if (r.isCited !== 1 || !r.citingOutletUrl) continue;
      try {
        const host = new URL(r.citingOutletUrl).hostname.toLowerCase().replace(/^www\./, "");
        if (host) domainOccurrenceMap.set(host, (domainOccurrenceMap.get(host) || 0) + 1);
      } catch {
        /* skip malformed URLs */
      }
    }
  } catch (err) {
    console.warn(
      `[citationChecker] failed to build domain occurrence map:`,
      err instanceof Error ? err.message : err,
    );
  }

  // Load competitors once so every task can pre-filter responses against them.
  // getCompetitors defaults to excluding deletedAt rows — ignored competitors
  // are soft-deleted too, so they're already filtered.
  const competitors = await storage.getCompetitors(brandId).catch((err) => {
    console.warn(
      `[citationChecker] getCompetitors failed — proceeding without competitor tracking:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  });
  console.log(
    `[citationChecker] loaded ${competitors.length} active competitors for brand ${brandId}`,
  );
  const competitorDetections = new Map<string, Map<string, number>>(); // competitorId → platform → cited count
  // Platforms where we've already done auto-discovery of new competitors
  // this run — once per (runId, platform) to cap LLM cost at ~5 extra
  // calls per run total.
  const autoDiscoveredPlatforms = new Set<string>();

  // Flatten all (prompt × platform) pairs into one queue and run them with a
  // fixed concurrency ceiling. As soon as one task finishes (AI call + DB
  // insert) the next one starts — no per-prompt batching, no waiting for the
  // slowest sibling. Concurrency = 5 keeps the burst size predictable and
  // well under every platform's rate limit.
  const CONCURRENCY = 5;

  type Task = { bp: (typeof prompts)[number]; promptIdx: number; platform: string };
  const queue: Task[] = [];
  prompts.forEach((bp, i) => {
    for (const platform of cappedPlatforms) {
      queue.push({ bp, promptIdx: i + 1, platform });
    }
  });

  console.log(
    `[citationChecker] starting ${prompts.length} prompts × ${cappedPlatforms.length} platforms = ${queue.length} checks (concurrency=${CONCURRENCY})`,
  );

  // Wave A: build the tracked-entity list once — brand + every competitor.
  // Passed to analyzeResponse on each task so a single LLM call returns
  // cited/rank/relevance/context/citedUrls for every entity plus any
  // untracked brands (candidates for auto-discovery).
  const MAX_AUTO_DISCOVERIES_PER_PLATFORM = 10;

  let cursor = 0;
  let completedCount = 0;
  const totalTasks = queue.length;
  const runOne = async (task: Task): Promise<void> => {
    const { bp, promptIdx, platform } = task;
    let responseText = "";
    let fetchError: string | null = null;
    const started = Date.now();

    // 1. Fetch the platform response with a single retry on transient failure
    // (rate limit, breaker trip, network blip). skipJudge=true — analyzer
    // below does all citation judgment in one merged call.
    const attemptFetch = async (): Promise<{ text: string; error: string | null }> => {
      try {
        const r = await runPlatformCitationCheck(
          platform,
          bp.prompt,
          brand,
          brandName,
          brandNameVariations,
          brand.website || undefined,
          brand.userId ?? undefined,
          { skipJudge: true },
        );
        return { text: r.responseText || "", error: r.error ?? null };
      } catch (apiError) {
        return { text: "", error: apiError instanceof Error ? apiError.message : "API error" };
      }
    };

    let attempt = await attemptFetch();
    if (attempt.error || !attempt.text) {
      await new Promise((r) => setTimeout(r, 2000));
      const retry = await attemptFetch();
      if (retry.text) attempt = retry;
      else if (retry.error) attempt = retry;
    }
    responseText = attempt.text;
    if (attempt.error) fetchError = attempt.error;
    if (fetchError) {
      console.error(
        `[citationChecker] prompt ${promptIdx} ${platform} FAILED after retry in ${Date.now() - started}ms —`,
        fetchError,
      );
    } else {
      console.log(
        `[citationChecker] prompt ${promptIdx} ${platform} fetched in ${Date.now() - started}ms`,
      );
    }

    // 2. Merged analyzer call: one JSON response returns {brands, tracked,
    // untracked}. tracked[entityId] contains each tracked entity's verdict
    // (cited, rank, relevance, context, citedUrls). untracked holds every
    // other brand the analyzer surfaced — feeds auto-discovery.
    const trackedEntities: TrackedEntity[] = [
      {
        kind: "brand",
        id: brand.id,
        name: brand.name,
        website: brand.website,
        industry: brand.industry,
        description: brand.description,
        aliases: [
          ...(Array.isArray(brand.nameVariations) ? brand.nameVariations : []),
          brand.companyName,
        ].filter((s): s is string => typeof s === "string" && s.trim().length > 0),
      },
      ...competitors.map(
        (c): TrackedEntity => ({
          kind: "competitor",
          id: c.id,
          name: c.name,
          website: c.domain || null,
          industry: (c as any).industry || null,
          description: (c as any).description || null,
        }),
      ),
    ];

    let analysis: Awaited<ReturnType<typeof analyzeResponse>> = {
      brands: [],
      tracked: Object.fromEntries(trackedEntities.map((e) => [e.id, null])),
      untracked: [],
    };
    if (responseText && !fetchError) {
      try {
        analysis = await analyzeResponse({ responseText, trackedEntities });
      } catch (err) {
        console.warn(
          `[citationChecker] analyzer failed for prompt ${promptIdx} ${platform}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Variant-learning loop: every surface form the analyzer surfaced for a
    // tracked entity that isn't already in its variant list gets appended.
    // The matcher reads variants live so subsequent detection calls see the
    // new forms without a deploy. User can delete unwanted variants from
    // the brand/competitor edit UI.
    for (const te of trackedEntities) {
      const verdict = analysis.tracked[te.id];
      if (!verdict) continue;
      const surfaceForms = [verdict.name, ...(verdict.variants ?? [])].filter(
        (s): s is string => typeof s === "string" && s.trim().length > 0,
      );
      for (const form of surfaceForms) {
        try {
          if (te.kind === "brand") {
            await storage.addBrandNameVariation(te.id, form);
          } else {
            await storage.addCompetitorNameVariation(te.id, form);
          }
        } catch (err) {
          logger.warn(
            { err, entityId: te.id, kind: te.kind, form },
            "citationChecker: variant append failed",
          );
        }
      }
    }

    const brandVerdict = analysis.tracked[brand.id] ?? null;
    const isCited = Boolean(brandVerdict?.cited);
    const rank = isCited ? (brandVerdict?.rank ?? null) : null;
    const relevance = brandVerdict?.relevance ?? null;
    const brandSentiment = deriveSentiment(relevance, isCited);

    let citationContext: string | null = null;
    if (fetchError) {
      // Even when the fetch failed, surface the error text in the delimited
      // section so the UI shows something useful instead of a generic "No
      // response captured." Prefix with "Check failed:" so the snippet area
      // explains the state, then put the raw error as the expanded response.
      const statusLine = fetchError.startsWith("Check failed")
        ? fetchError
        : `Check failed: ${fetchError}`;
      citationContext = `${statusLine}\n\n||| RAW_RESPONSE |||\n${fetchError}`;
    } else {
      const statusLine = isCited ? "Cited" : "Not cited";
      citationContext = `${statusLine}\n\n||| RAW_RESPONSE |||\n${responseText}`;
    }

    // 3. citingOutletUrl — prefer the analyzer's explicitly-attributed URL
    // for the brand, fall back to the first URL regex-extracted from the
    // response. Feeds Source Types, authority_score, and Citation Quality.
    const analyzerUrl = brandVerdict?.citedUrls?.[0] ?? null;
    const extractedUrl = extractFirstUrl(responseText);
    const citingOutletUrl = analyzerUrl || extractedUrl;
    const sourceType = classifySourceType(citingOutletUrl);
    const authorityScore = computeAuthorityScore(citingOutletUrl, domainOccurrenceMap);
    if (citingOutletUrl) {
      try {
        const host = new URL(
          citingOutletUrl.startsWith("http") ? citingOutletUrl : `https://${citingOutletUrl}`,
        ).hostname
          .toLowerCase()
          .replace(/^www\./, "");
        if (host) domainOccurrenceMap.set(host, (domainOccurrenceMap.get(host) || 0) + 1);
      } catch {
        /* skip malformed URLs */
      }
    }

    // 4. Competitor citation rows — one per competitor the analyzer flagged
    // as cited. Absence of a row = not cited (keeps table narrow).
    if (responseText && !fetchError) {
      for (const comp of competitors) {
        const v = analysis.tracked[comp.id];
        if (!v || !v.cited) continue;
        const compUrl = v.citedUrls?.[0] ?? citingOutletUrl;
        const compContext = v.context
          ? `${v.context.slice(0, 400)}\n\n||| RAW_RESPONSE |||\n${responseText}`
          : citationContext;
        try {
          await storage.createCompetitorGeoRanking({
            competitorId: comp.id,
            runId: citationRun.id,
            brandPromptId: bp.id,
            aiPlatform: platform,
            isCited: 1,
            rank: v.rank,
            relevanceScore: v.relevance,
            citationContext: compContext,
            citingOutletUrl: compUrl,
            sentiment: deriveSentiment(v.relevance, true),
          } as any);
        } catch (err) {
          console.warn(
            `[citationChecker] competitor_geo_rankings insert failed for ${comp.name}:`,
            err instanceof Error ? err.message : err,
          );
        }

        const perPlatform = competitorDetections.get(comp.id) || new Map<string, number>();
        perPlatform.set(platform, (perPlatform.get(platform) || 0) + 1);
        competitorDetections.set(comp.id, perPlatform);
      }

      // 5. Auto-discovery — upsert analyzer.untracked brands as new
      // competitors with discoveredBy='citation_auto'. Only when the brand
      // was cited (filters off-topic responses) and only once per
      // (runId, platform) with a per-platform cap to bound storm risk.
      if (isCited && !autoDiscoveredPlatforms.has(platform) && analysis.untracked.length > 0) {
        autoDiscoveredPlatforms.add(platform);
        let inserted = 0;
        const candidates = analysis.untracked
          .filter((u) => u.cited)
          .slice(0, MAX_AUTO_DISCOVERIES_PER_PLATFORM);
        for (const cand of candidates) {
          const name = cand.name?.trim();
          if (!name || name.length < 2 || name.length > 120) continue;
          const firstUrl = cand.citedUrls?.[0] ?? "";
          let derivedDomain = "";
          if (firstUrl) {
            try {
              const u = firstUrl.startsWith("http") ? firstUrl : `https://${firstUrl}`;
              derivedDomain = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
            } catch {
              /* skip bad URLs */
            }
          }
          try {
            await storage.createCompetitor({
              brandId,
              name,
              domain: derivedDomain,
              industry: brand.industry || null,
              description: "[auto-discovered from citation run]",
              discoveredBy: "citation_auto",
            } as any);
            inserted += 1;
          } catch (err) {
            console.warn(
              `[citationChecker] auto-discovery upsert failed for ${name}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
        if (inserted > 0) {
          console.log(
            `[citationChecker] auto-discovered ${inserted} new competitors from ${platform}`,
          );
        }
      }
    }

    // 6. Write the brand's geo_ranking row (always — denominator for
    // citation-rate) and brand_mentions on cited responses.
    try {
      const row = await storage.createGeoRanking({
        articleId: null,
        brandPromptId: bp.id,
        runId: citationRun.id,
        aiPlatform: platform,
        prompt: bp.prompt,
        rank,
        isCited: isCited ? 1 : 0,
        citationContext,
        citingOutletUrl,
        sourceType,
        authorityScore,
        relevanceScore: relevance,
        sentiment: brandSentiment,
        checkedAt: new Date(),
      } as any);
      rankings.push(row);
      if (isCited) totalCited += 1;
      console.log(
        `[citationChecker] prompt ${promptIdx} ${platform} saved at ${Date.now() - started}ms — cited=${isCited}`,
      );

      // Brand mentions — semantic distinction from citations:
      //   Citation = brand appeared in a ranked recommendation (geo_rankings.isCited=1)
      //   Mention  = brand name appeared in the response at all, even if
      //              only as a passing reference (analyzer detected it)
      // We write a brand_mentions row whenever the analyzer surfaced the
      // brand, NOT just on cited responses. This keeps "Brand Mentions" on
      // client-reports meaningfully different from "Citations" — previously
      // they were the same number since mentions were only written on
      // cited rows.
      //
      // Synthetic URL makes every (run, prompt, platform) tuple unique so
      // the (brand_id, platform, source_url) dedup index doesn't inflate on
      // re-runs. `rank` is null when the brand was mentioned without being
      // in a ranked list — UI can filter on this to distinguish the two.
      const brandDetected = Boolean(brandVerdict);
      if (brandDetected) {
        const syntheticUrl = citingOutletUrl || `ai://${platform}/${citationRun.id}/${bp.id}`;
        const aiPlatformLabel = `ai:${platform}`;
        try {
          await storage.createBrandMention({
            brandId,
            platform: aiPlatformLabel,
            sourceUrl: syntheticUrl,
            sourceTitle: bp.prompt.slice(0, 500),
            mentionContext: brandVerdict?.context?.slice(0, 2000) || responseText.slice(0, 2000),
            sentiment: brandSentiment ?? "neutral",
            sentimentScore:
              relevance !== null
                ? (Math.max(0, Math.min(100, relevance)) / 50 - 1).toFixed(2)
                : "0",
            engagementScore: null,
            mentionedAt: new Date(),
            metadata: {
              runId: citationRun.id,
              brandPromptId: bp.id,
              rank,
              // `cited` distinguishes a full citation from a passing
              // mention when downstream code wants only the stronger signal.
              cited: isCited,
            },
          } as any);
        } catch (mentionErr) {
          const msg = mentionErr instanceof Error ? mentionErr.message : String(mentionErr);
          if (!/duplicate key|unique/i.test(msg)) {
            console.warn(`[citationChecker] brand mention insert failed — ${msg}`);
          }
        }
      }
    } catch (dbErr) {
      console.error(
        `[citationChecker] prompt ${promptIdx} ${platform} DB insert failed —`,
        dbErr instanceof Error ? dbErr.message : dbErr,
      );
    }
  };

  const worker = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= queue.length) return;
      await runOne(queue[idx]);
      completedCount += 1;
      if (options.onProgress) {
        try {
          await options.onProgress(completedCount, totalTasks);
        } catch (err) {
          logger.warn({ err }, "citationChecker: onProgress callback threw");
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));

  // Finalize the run row with aggregate totals + per-platform breakdown.
  const totalChecks = rankings.length;
  const citationRate = totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0;
  const platformMap = new Map<string, { cited: number; checks: number }>();
  for (const r of rankings) {
    const entry = platformMap.get(r.aiPlatform) || { cited: 0, checks: 0 };
    entry.checks += 1;
    if (r.isCited === 1) entry.cited += 1;
    platformMap.set(r.aiPlatform, entry);
  }
  const platformBreakdown = Object.fromEntries(
    Array.from(platformMap.entries()).map(([p, s]) => [
      p,
      { ...s, rate: s.checks > 0 ? Math.round((s.cited / s.checks) * 100) : 0 },
    ]),
  );
  await storage.updateCitationRun(citationRun.id, {
    totalChecks,
    totalCited,
    citationRate,
    completedAt: new Date(),
    platformBreakdown,
  });

  console.log(
    `[citationChecker] run ${citationRun.id} complete — ${totalCited}/${totalChecks} cited (${citationRate}%)`,
  );

  // Post-processing stage. All three are best-effort — a failure here must
  // never revert the rankings we already saved.

  // 1. Competitor citation snapshots — one row per (competitor, platform,
  // runId). runId is used as the idempotency key so retries don't inflate
  // leaderboard totals.
  for (const [competitorId, perPlatform] of Array.from(competitorDetections.entries())) {
    for (const [platform, count] of Array.from(perPlatform.entries())) {
      try {
        await storage.createCompetitorCitationSnapshot({
          competitorId,
          aiPlatform: platform,
          citationCount: count,
          runId: citationRun.id,
        } as any);
      } catch (err) {
        console.warn(
          `[citationChecker] competitor snapshot insert failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // 2. Metrics history — one row per tracked metric so the trend chart has
  // a real data point from this run.
  try {
    const { recordCurrentMetrics } = await import("./lib/metricsSnapshot");
    await recordCurrentMetrics(brandId, { citationRate, totalChecks, totalCited });
  } catch (err) {
    console.warn(
      `[citationChecker] metrics snapshot failed:`,
      err instanceof Error ? err.message : err,
    );
  }

  // 3. Hallucination detection — compare each cited response against the
  // brand fact sheet. Skipped if the fact sheet is empty.
  try {
    const { detectHallucinationsForRun, reverifyHallucinationsForRun } =
      await import("./lib/hallucinationDetector");
    await detectHallucinationsForRun(brandId, rankings);
    // 3b. Re-verify: auto-close previously-flagged hallucinations whose
    // claimedStatement no longer appears in this run's responses.
    await reverifyHallucinationsForRun(brandId, rankings);
  } catch (err) {
    console.warn(
      `[citationChecker] hallucination detection failed:`,
      err instanceof Error ? err.message : err,
    );
  }

  return { totalChecks, totalCited, rankings, runId: citationRun.id };
}
