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
import { detectBrandAndCompetitors, matchEntity } from "./lib/brandMatcher";
import { findSelfCitationsInText } from "./lib/trackedContentMatcher";
import { dynamicLockNamespaces, withDynamicAdvisoryLock } from "./lib/advisoryLock";
import { extractCitedUrls } from "./lib/urlExtractor";
import type { TrackedContentUrl } from "@shared/schema";

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

// Cap on per-run competitor map size. Vercel Hobby has 1024 MB memory; a
// runaway run with thousands of competitors × dozens of platforms could
// approach that limit. Cap surfaces the issue (via onCapHit) instead of
// silently degrading. Updates to existing competitors always work; only
// NEW competitor IDs beyond the cap are dropped.
const COMPETITOR_DETECTIONS_CAP = 5000;

export function addCompetitorDetection(
  map: Map<string, Map<string, number>>,
  competitorId: string,
  platform: string,
  delta = 1,
  onCapHit?: () => void,
): void {
  const existing = map.get(competitorId);
  if (existing) {
    existing.set(platform, (existing.get(platform) || 0) + delta);
    return;
  }
  if (map.size >= COMPETITOR_DETECTIONS_CAP) {
    if (onCapHit) onCapHit();
    return;
  }
  const fresh = new Map<string, number>();
  fresh.set(platform, delta);
  map.set(competitorId, fresh);
}

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

  // Wave 8: matcher already said "yes" above. The LLM judge runs only to
  // enrich rank/relevance — it CANNOT flip isCited back to false. If the
  // judge says cited=false but the matcher hit, we still return
  // isCited=true (matcher wins) and discard the judge's rank/relevance.
  try {
    const verdict = await judgeCitation({ responseText, brand: judgeBrand });
    if (!verdict.cited) {
      logger.info(
        { brandName, hitVariants: matcherResult.hitVariants },
        "citation.matcher.disagreement",
      );
    }
    const useJudgeEnrichment = verdict.cited;
    return {
      isCited: true,
      rank: useJudgeEnrichment ? verdict.rank : null,
      relevance: useJudgeEnrichment ? verdict.relevance : null,
      reasoning: verdict.reasoning,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ msg: msg }, `[citationChecker] judge call failed —`);
    // Wave 8: judge failure no longer flips matcher-yes to no. The
    // matcher already determined the brand is named in the response; we
    // record isCited=true with no rank/relevance enrichment.
    return {
      isCited: true,
      rank: null,
      relevance: null,
      reasoning: `Judge unreachable: ${msg}`,
    };
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
  structuredCitations: string[];
  error?: string;
}> {
  const { skipJudge = false } = opts;
  const brandContext = {
    website: website || brand?.website || null,
    companyName: brand?.companyName || null,
    description: brand?.description || null,
    industry: brand?.industry || null,
  };
  // Neutral, naturalistic persona. The previous prompt explicitly told the
  // model to cite "specific sources, brands, companies, or products", which
  // inflated measured visibility — a brand could surface only because the
  // model was nudged to name brands, not because it would organically. To
  // measure real GEO visibility we must query the way a normal user would,
  // with no instruction that biases toward (or against) naming brands.
  // Expect this to LOWER reported citation rates: that is a correctness
  // de-inflation, not a regression.
  const systemMsg =
    "Answer the question helpfully, accurately, and naturally — exactly as you would for any user.";

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
    // ChatGPT (direct OpenAI) doesn't return a top-level structured-citations
    // array, so always empty here. Phase 3 structured-citation capture is
    // Perplexity-specific (in the OpenRouter branch below).
    const structuredCitations: string[] = [];
    if (skipJudge)
      return { isCited: false, rank: null, relevance: null, responseText, structuredCitations };
    const r = await checkForCitation(responseText, brandName, brandNameVariations, brandContext);
    return {
      isCited: r.isCited,
      rank: r.rank,
      relevance: r.relevance,
      responseText,
      structuredCitations,
    };
  }

  const openrouterModel = OPENROUTER_MODEL_BY_PLATFORM[platform];
  if (!openrouterModel) {
    return {
      isCited: false,
      rank: null,
      relevance: null,
      responseText: "",
      structuredCitations: [],
      error: `Unknown citation platform: ${platform}`,
    };
  }

  if (!openrouter) {
    return {
      isCited: false,
      rank: null,
      relevance: null,
      responseText: "",
      structuredCitations: [],
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
  // Phase 3: Perplexity (via OpenRouter) returns a top-level `citations`
  // array of source URLs alongside the response content. Other platforms
  // (ChatGPT/Claude/Gemini/DeepSeek) don't return this field, so we
  // capture defensively. The URLs end up merged with text-extracted URLs
  // at the geo_rankings INSERT site.
  const structuredCitations: string[] = Array.isArray((chatResponse as any).citations)
    ? ((chatResponse as any).citations as unknown[]).filter(
        (c): c is string => typeof c === "string",
      )
    : [];
  if (skipJudge)
    return { isCited: false, rank: null, relevance: null, responseText, structuredCitations };
  const r = await checkForCitation(responseText, brandName, brandNameVariations, brandContext);
  return {
    isCited: r.isCited,
    rank: r.rank,
    relevance: r.relevance,
    responseText,
    structuredCitations,
  };
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
    // Vercel migration: when set, the per-pair worker loop checks this
    // deadline and stops scheduling new pairs once exceeded. Run stays
    // in 'running' state so the next slice (via /advance or cron drain)
    // can pick up where we left off.
    deadlineMs?: number;
    // Vercel migration: when true, skip pairs that already have a
    // geo_ranking row for this run. Used by the slice runner to resume
    // a partially-completed run without redoing pairs.
    resume?: boolean;
  } = {},
): Promise<{
  totalChecks: number;
  totalCited: number;
  rankings: GeoRanking[];
  runId: string | null;
  done: boolean;
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
  if (prompts.length === 0)
    return { totalChecks: 0, totalCited: 0, rankings: [], runId: null, done: true };

  // Create a citation_runs row upfront so every geo_ranking can reference it.
  // Wave 8: status='running' from creation so the live-update polling hook
  // on every dependent page sees the run immediately and switches into
  // refetch mode.
  // Wave 9: if the caller already created the row (via kickoffBrandPromptsRun
  // for the async POST /run path) we reuse it. The kickoff path lets the HTTP
  // handler return immediately while the run continues in the background.
  const triggeredBy = options.triggeredBy ?? "manual";
  let citationRun;
  if (options.runId) {
    const existing = await storage.getCitationRunById(options.runId);
    if (!existing) throw new Error(`citation_runs row ${options.runId} not found`);
    citationRun = existing;
  } else {
    citationRun = await storage.createCitationRun({
      brandId,
      triggeredBy,
      totalChecks: 0,
      totalCited: 0,
      citationRate: 0,
      status: "running",
      progressPct: 0,
    } as any);
  }

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
    logger.warn({ err: err }, `[citationChecker] failed to build domain occurrence map:`);
  }

  // Load competitors once so every task can pre-filter responses against them.
  // getCompetitors defaults to excluding deletedAt rows — ignored competitors
  // are soft-deleted too, so they're already filtered.
  const competitors = await storage.getCompetitors(brandId).catch((err) => {
    logger.warn(
      { err: err },
      `[citationChecker] getCompetitors failed — proceeding without competitor tracking:`,
    );
    return [];
  });
  logger.info(
    `[citationChecker] loaded ${competitors.length} active competitors for brand ${brandId}`,
  );

  // Wave 9.4: tracked content URLs — the brand's own published BOFU/FAQ
  // pages. Loaded once per run; substring-matched against each LLM
  // response below so we can stamp last_cited_at + bump
  // citation_runs.self_citation_count whenever an AI engine cites
  // something the user generated themselves.
  const trackedContentUrls = await storage
    .getTrackedContentUrlsByBrandId(brandId)
    .catch(() => [] as TrackedContentUrl[]);
  // Dedup the set of (sourceType, sourceId) we've already stamped so a
  // single piece of content gets at most one timestamp update + counter
  // bump per run regardless of how many cells cite it.
  const stampedThisRun = new Set<string>();

  const competitorDetections = new Map<string, Map<string, number>>(); // competitorId → platform → cited count
  let competitorDetectionsCapWarned = false; // fires once per run if we hit the 5000-competitor cap
  // Platforms where we've already done auto-discovery of new competitors
  // this run — once per (runId, platform) to cap LLM cost at ~5 extra
  // calls per run total.
  const autoDiscoveredPlatforms = new Set<string>();

  // Wave 9: run-scoped variation cache. Previously we did getBrandById +
  // getCompetitors once per response (~50 reads per typical run) just to
  // pick up freshly-learned variations from the analyzer. Instead, build
  // the cache once at run start and mutate it in-place when
  // addBrandNameVariation / addCompetitorNameVariation succeed below. The
  // matcher reads from this cache directly. Strict ordering preserved:
  // analyzer surfaces variants → cache mutated → matcher pass uses the
  // updated cache for THIS response.
  const variationCache = new Map<string, string[]>();
  variationCache.set(
    brandId,
    [
      brand.companyName ?? null,
      brand.name ?? null,
      ...(Array.isArray(brand.nameVariations) ? brand.nameVariations : []),
    ].filter((s): s is string => typeof s === "string" && s.trim().length > 0),
  );
  for (const c of competitors) {
    variationCache.set(
      c.id,
      [
        c.name ?? null,
        ...(Array.isArray((c as any).nameVariations)
          ? ((c as any).nameVariations as string[])
          : []),
      ].filter((s): s is string => typeof s === "string" && s.trim().length > 0),
    );
  }
  // Helper to append a variant to the cache idempotently — also writes to
  // DB so the variant persists across runs. Lower-case dedupe matches the
  // matcher's canonicalization.
  const appendVariation = async (entityId: string, kind: "brand" | "competitor", form: string) => {
    const trimmed = form.trim();
    if (!trimmed) return;
    const existing = variationCache.get(entityId) ?? [];
    if (existing.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    existing.push(trimmed);
    variationCache.set(entityId, existing);
    try {
      if (kind === "brand") await storage.addBrandNameVariation(entityId, trimmed);
      else await storage.addCompetitorNameVariation(entityId, trimmed);
    } catch (err) {
      logger.warn({ err, entityId, kind, form: trimmed }, "citationChecker.appendVariation_failed");
    }
  };

  // Wave 9: per-run disagreement counter. Persisted on finalize so HistoryTab
  // can surface "matcher and analyzer disagreed on N of M checks" — useful
  // for tuning the variation list. Rate >5% suggests the brand needs more
  // user-supplied variations.
  let disagreementCount = 0;

  // Flatten all (prompt × platform) pairs into one queue and run them with a
  // fixed concurrency ceiling. As soon as one task finishes (AI call + DB
  // insert) the next one starts — no per-prompt batching, no waiting for the
  // slowest sibling. Concurrency = 5 keeps the burst size predictable and
  // well under every platform's rate limit.
  const CONCURRENCY = 5;

  type Task = { bp: (typeof prompts)[number]; promptIdx: number; platform: string };
  const queue: Task[] = [];

  // Vercel migration: when resuming a partially-completed run, skip the
  // (prompt, platform) pairs that already have a geo_ranking row from a
  // prior slice. Build a quick set of "<promptId>::<platform>" keys.
  const alreadyDone = new Set<string>();
  // Cumulative counts across prior slices, so progress percent + totalChecks
  // + totalCited reflect the whole run, not just this slice. Without these,
  // every /advance call resets the visible numbers (the bug where the
  // progress bar shows "5/5 — 20%" for a run that already has 28 rankings).
  let resumedChecks = 0;
  let resumedCited = 0;
  if (options.resume) {
    try {
      const existing = await storage.getGeoRankingsByRunId(citationRun.id);
      for (const r of existing) {
        alreadyDone.add(`${r.brandPromptId}::${r.aiPlatform}`);
        if (r.isCited) resumedCited += 1;
      }
      resumedChecks = existing.length;
    } catch (err) {
      logger.warn(
        { err, runId: citationRun.id },
        "citationChecker: getGeoRankingsByRunId for resume failed; falling back to full queue",
      );
    }
  }

  prompts.forEach((bp, i) => {
    for (const platform of cappedPlatforms) {
      if (alreadyDone.has(`${bp.id}::${platform}`)) continue;
      queue.push({ bp, promptIdx: i + 1, platform });
    }
  });

  logger.info(
    `[citationChecker] ${options.resume ? "resuming" : "starting"} ${prompts.length} prompts × ${cappedPlatforms.length} platforms = ${queue.length} pending checks (concurrency=${CONCURRENCY}${options.resume ? `, ${alreadyDone.size} already done` : ""})`,
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
    let structuredCitations: string[] = [];
    let fetchError: string | null = null;
    const started = Date.now();

    // 1. Fetch the platform response with a single retry on transient failure
    // (rate limit, breaker trip, network blip). skipJudge=true — analyzer
    // below does all citation judgment in one merged call.
    const attemptFetch = async (): Promise<{
      text: string;
      structuredCitations: string[];
      error: string | null;
    }> => {
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
        return {
          text: r.responseText || "",
          structuredCitations: r.structuredCitations ?? [],
          error: r.error ?? null,
        };
      } catch (apiError) {
        return {
          text: "",
          structuredCitations: [],
          error: apiError instanceof Error ? apiError.message : "API error",
        };
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
    structuredCitations = attempt.structuredCitations;
    if (attempt.error) fetchError = attempt.error;
    if (fetchError) {
      logger.error(
        { fetchError: fetchError },
        `[citationChecker] prompt ${promptIdx} ${platform} FAILED after retry in ${Date.now() - started}ms —`,
      );
    } else {
      logger.info(
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
        logger.warn(
          { err: err },
          `[citationChecker] analyzer failed for prompt ${promptIdx} ${platform}:`,
        );
      }
    }

    // Variant-learning loop: every surface form the analyzer surfaced for a
    // tracked entity that isn't already in its variant list gets appended.
    // The matcher reads variants live so subsequent detection calls see the
    // new forms without a deploy. User can delete unwanted variants from
    // the brand/competitor edit UI.
    // Wave 9: append every analyzer-surfaced variant into the run-scoped
    // cache (and persist to DB). This replaces the per-response
    // getBrandById + getCompetitors round-trip — same correctness, ~50
    // fewer reads per typical run.
    for (const te of trackedEntities) {
      const verdict = analysis.tracked[te.id];
      if (!verdict) continue;
      const surfaceForms = [verdict.name, ...(verdict.variants ?? [])].filter(
        (s): s is string => typeof s === "string" && s.trim().length > 0,
      );
      for (const form of surfaceForms) {
        await appendVariation(te.id, te.kind, form);
      }
    }

    // Wave 8: matcher-authoritative `isCited`. Run the universal matcher —
    // its verdict overrides the analyzer's `cited` boolean for every
    // isCited write below. Analyzer's enrichment fields (rank, relevance,
    // context, citedUrls) are still used, but only when matcher confirms.
    // Variations come from the run-scoped cache (Wave 9) so the matcher
    // sees variants the analyzer just learned for THIS response without
    // a DB round-trip.
    const matcherDetection = responseText
      ? detectBrandAndCompetitors(
          responseText,
          {
            id: brand.id,
            name: brand.name,
            website: brand.website ?? null,
            nameVariations: variationCache.get(brand.id) ?? [],
          },
          competitors.map((c) => ({
            id: c.id,
            name: c.name,
            website: c.domain ?? null,
            nameVariations: variationCache.get(c.id) ?? [],
          })),
        )
      : {
          brand: { matched: false, hitVariants: [], positions: [] },
          competitors: [] as Array<{
            competitorId: string;
            competitorName: string;
            result: { matched: boolean; hitVariants: string[]; positions: number[] };
          }>,
        };

    // Build a quick id→result lookup for the per-competitor write below.
    const matcherCompResultById = new Map(
      matcherDetection.competitors.map((c) => [c.competitorId, c.result]),
    );

    const matcherBrandMatched = matcherDetection.brand.matched;
    const brandVerdict = analysis.tracked[brand.id] ?? null;
    const analyzerCited = Boolean(brandVerdict?.cited);

    // Wave 9.4: self-citation detection. If the LLM response includes a
    // URL we registered as user-published content (BOFU or FAQ), stamp
    // the source row's lastCitedAt and bump the run's
    // selfCitationCount. Idempotent within a single run via
    // stampedThisRun.
    if (responseText && trackedContentUrls.length > 0) {
      const hits = findSelfCitationsInText(responseText, trackedContentUrls);
      for (const hit of hits) {
        const key = `${hit.sourceType}:${hit.sourceId}`;
        if (stampedThisRun.has(key)) continue;
        stampedThisRun.add(key);
        try {
          await storage.stampSelfCitation(hit.sourceType as "bofu" | "faq", hit.sourceId);
          await storage.incrementCitationRunSelfCitations(citationRun.id, 1);
        } catch (err) {
          logger.warn(
            { err, runId: citationRun.id, sourceType: hit.sourceType, sourceId: hit.sourceId },
            "self-citation stamp failed",
          );
        }
      }
    }

    // Disagreement logging — useful for tuning the variation list. Both
    // directions are interesting: matcher-yes/analyzer-no usually means
    // a phrase that's a citation but the analyzer judged off-topic;
    // matcher-no/analyzer-yes usually means analyzer hallucinated or
    // surfaced a name we haven't taught the matcher yet.
    if (matcherBrandMatched !== analyzerCited && responseText) {
      disagreementCount += 1;
      logger.info(
        {
          brandId,
          platform,
          promptId: bp.id,
          analyzerCited,
          matcherMatched: matcherBrandMatched,
          learnedVariants: brandVerdict
            ? [brandVerdict.name, ...(brandVerdict.variants ?? [])].filter(Boolean)
            : [],
          hitVariants: matcherDetection.brand.hitVariants,
        },
        "citation.matcher.disagreement",
      );
    }

    // Matcher wins. Analyzer's rank/relevance only carry over when the
    // matcher agreed. When matcher says cited but analyzer did not, we
    // still write isCited=1 but with null rank/relevance (no fabricated
    // enrichment). When matcher says not cited, we write isCited=0
    // regardless of analyzer.
    const isCited = matcherBrandMatched;
    const rank = isCited && analyzerCited ? (brandVerdict?.rank ?? null) : null;
    const relevance = isCited && analyzerCited ? (brandVerdict?.relevance ?? null) : null;
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

    // 4. Competitor citation rows — one per competitor the matcher hit on
    // this response. Absence of a row = not cited (keeps table narrow).
    // Wave 8: matcher is authoritative for isCited; analyzer's rank/
    // relevance only used when matcher agrees.
    if (responseText && !fetchError) {
      for (const comp of competitors) {
        const compMatch = matcherCompResultById.get(comp.id);
        if (!compMatch || !compMatch.matched) continue;
        const v = analysis.tracked[comp.id] ?? null;
        const analyzerCompCited = Boolean(v?.cited);
        if (analyzerCompCited !== true) {
          logger.info(
            {
              competitorId: comp.id,
              platform,
              promptId: bp.id,
              analyzerCited: analyzerCompCited,
              matcherMatched: true,
              hitVariants: compMatch.hitVariants,
            },
            "citation.matcher.disagreement",
          );
        }
        const compUrl = v?.citedUrls?.[0] ?? citingOutletUrl;
        const compContext = v?.context
          ? `${v.context.slice(0, 400)}\n\n||| RAW_RESPONSE |||\n${responseText}`
          : citationContext;
        // Use analyzer enrichment only when analyzer also said cited;
        // otherwise null/default so we don't fabricate rank/relevance.
        const compRank = analyzerCompCited ? (v?.rank ?? null) : null;
        const compRelevance = analyzerCompCited ? (v?.relevance ?? null) : null;
        try {
          await storage.createCompetitorGeoRanking({
            competitorId: comp.id,
            runId: citationRun.id,
            brandPromptId: bp.id,
            aiPlatform: platform,
            isCited: 1,
            rank: compRank,
            relevanceScore: compRelevance,
            citationContext: compContext,
            citingOutletUrl: compUrl,
            sentiment: deriveSentiment(compRelevance, true),
          } as any);
        } catch (err) {
          logger.warn(
            { err: err },
            `[citationChecker] competitor_geo_rankings insert failed for ${comp.name}:`,
          );
        }

        addCompetitorDetection(competitorDetections, comp.id, platform, 1, () => {
          if (!competitorDetectionsCapWarned) {
            competitorDetectionsCapWarned = true;
            logger.warn(
              { brandId, runId: citationRun.id, cap: 5000 },
              "citationChecker: competitorDetections cap hit — additional competitors dropped from this run",
            );
          }
        });
      }

      // 5. Auto-discovery — upsert analyzer.untracked brands as new
      // competitors with discoveredBy='citation_auto'. Only when the
      // brand was cited (filters off-topic responses) and only once per
      // (runId, platform) with a per-platform cap to bound storm risk.
      // Wave 8: each candidate is matcher-confirmed against the response
      // text before insert — protects against analyzer hallucinations
      // creating phantom competitor rows for brands that aren't actually
      // mentioned.
      if (isCited && !autoDiscoveredPlatforms.has(platform) && analysis.untracked.length > 0) {
        autoDiscoveredPlatforms.add(platform);
        let inserted = 0;
        let dropped = 0;
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
          // Matcher-confirm the candidate before persisting. Use the
          // analyzer's reported name + variants as the entity definition,
          // and the response text as the haystack. If the matcher can't
          // find the brand at all, skip — analyzer probably hallucinated.
          const candMatch = matchEntity(responseText, {
            id: `auto-${name}`,
            name,
            nameVariations: cand.variants ?? [],
            website: derivedDomain || null,
          });
          if (!candMatch.matched) {
            dropped += 1;
            logger.info(
              { brandId, platform, candidate: name, variants: cand.variants ?? [] },
              "citation.auto_discovery.dropped_no_match",
            );
            continue;
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
            logger.warn(
              { err: err },
              `[citationChecker] auto-discovery upsert failed for ${name}:`,
            );
          }
        }
        if (inserted > 0 || dropped > 0) {
          logger.info(
            `[citationChecker] auto-discovery ${platform}: inserted=${inserted}, dropped=${dropped}`,
          );
        }
      }
    }

    // 6. Write the brand's geo_ranking row (always — denominator for
    // citation-rate) and brand_mentions on cited responses.
    // Phase 3: capture URLs the LLM cited in its response. We feed
    // extractCitedUrls a synthetic input that prepends Perplexity's
    // structured `citations: string[]` (when present) to the response text
    // so dedupe + cap semantics apply uniformly across both sources. For
    // non-Perplexity platforms structuredCitations is [], so this collapses
    // to text-only extraction.
    const citedUrlsInput = structuredCitations.length
      ? `${structuredCitations.join(" ")} ${responseText}`
      : responseText;
    const citedUrls = extractCitedUrls(citedUrlsInput);
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
        citedUrls,
        sourceType,
        authorityScore,
        relevanceScore: relevance,
        sentiment: brandSentiment,
        checkedAt: new Date(),
      } as any);
      rankings.push(row);
      if (isCited) totalCited += 1;
      logger.info(
        `[citationChecker] prompt ${promptIdx} ${platform} saved at ${Date.now() - started}ms — cited=${isCited}`,
      );
    } catch (dbErr) {
      logger.error(
        { dbErr: dbErr },
        `[citationChecker] prompt ${promptIdx} ${platform} DB insert failed —`,
      );
    }
  };

  // Wave 8/9: bump citation_runs.progress_pct so the live-update hook sees
  // movement. Bump cadence: every PROGRESS_BUMP_EVERY tasks OR every
  // PROGRESS_BUMP_INTERVAL_MS, whichever comes first. The time-based path
  // ensures small runs (e.g. 3-task single-prompt re-runs) still feel live;
  // the count-based path keeps the write rate sane on large runs.
  const PROGRESS_BUMP_EVERY = 5;
  const PROGRESS_BUMP_INTERVAL_MS = 1500;
  let lastBumpAt = 0;
  let tasksSinceBump = 0;
  const bumpProgressIfDue = async (force = false) => {
    if (completedCount === 0 && !force) return;
    if (completedCount === totalTasks) return; // finalize handles 100%
    tasksSinceBump += 1;
    const now = Date.now();
    const dueByCount = tasksSinceBump >= PROGRESS_BUMP_EVERY;
    const dueByTime = now - lastBumpAt >= PROGRESS_BUMP_INTERVAL_MS;
    if (!force && !dueByCount && !dueByTime) return;
    const cumulativeDone = resumedChecks + completedCount;
    const cumulativeTotal = resumedChecks + totalTasks;
    const cumulativeCited = resumedCited + totalCited;
    const pct = Math.min(99, Math.floor((cumulativeDone / Math.max(1, cumulativeTotal)) * 100));
    try {
      await storage.bumpCitationRunProgress(citationRun.id, pct, cumulativeDone, cumulativeCited);
      lastBumpAt = now;
      tasksSinceBump = 0;
    } catch (err) {
      logger.warn({ err, runId: citationRun.id }, "bumpCitationRunProgress failed");
    }
  };

  const worker = async (): Promise<void> => {
    while (true) {
      // Vercel migration: bail before scheduling more work if the
      // caller-provided deadline has elapsed. Pairs not yet started in
      // this slice will be picked up by the next /advance call.
      if (options.deadlineMs !== undefined && Date.now() > options.deadlineMs) {
        return;
      }
      const idx = cursor++;
      if (idx >= queue.length) return;
      await runOne(queue[idx]);
      completedCount += 1;
      await bumpProgressIfDue();
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

  // Did we finish every pair, or did we bail out on the deadline?
  // cursor is one past the last claimed index, so cursor < queue.length
  // means at least one task wasn't even claimed. (Tasks claimed but not
  // completed when the slice deadline hit are extremely rare since we
  // check the deadline before claiming, but to be safe we also let the
  // next /advance re-detect undone pairs via geo_rankings absence.)
  const sliceCompleted = cursor >= queue.length;
  if (!sliceCompleted) {
    logger.info(
      {
        runId: citationRun.id,
        processed: cursor,
        remaining: queue.length - cursor,
      },
      "citationChecker: slice deadline reached, deferring remainder",
    );
    return {
      totalChecks: rankings.length,
      totalCited,
      rankings,
      runId: citationRun.id,
      done: false,
    };
  }

  // Finalize the run row with aggregate totals + per-platform breakdown.
  // Re-query so totals reflect the entire run, not just this slice — on
  // Vercel a multi-slice resume run only has the final slice's rankings
  // in the local `rankings` array.
  const allRankings = options.resume
    ? await storage.getGeoRankingsByRunId(citationRun.id).catch(() => rankings)
    : rankings;
  const totalChecks = allRankings.length;
  const finalTotalCited = allRankings.reduce((n, r) => n + (r.isCited === 1 ? 1 : 0), 0);
  const citationRate = totalChecks > 0 ? Math.round((finalTotalCited / totalChecks) * 100) : 0;
  const platformMap = new Map<string, { cited: number; checks: number }>();
  for (const r of allRankings) {
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
  // Wave 8: classify the run as succeeded / partial / failed based on what
  // actually got persisted. 'partial' = some checks went through but at
  // least one platform fully failed (every task on it errored). For now
  // we treat any run with rankings present as succeeded — the platform-
  // level partial-failure detection is left for a future tighter pass.
  const runStatus: "succeeded" | "failed" = totalChecks === 0 ? "failed" : "succeeded";

  await storage.updateCitationRun(citationRun.id, {
    totalChecks,
    totalCited: finalTotalCited,
    citationRate,
    completedAt: new Date(),
    platformBreakdown,
    status: runStatus,
    progressPct: 100,
    // Wave 9: surface a reason on HistoryTab when a run finalizes with zero
    // rankings — helps users tell "0% citation rate" apart from "every API
    // call failed". The detached kickoff overwrites this if the run threw.
    ...(runStatus === "failed" && totalChecks === 0
      ? { errorMessage: "All platform calls failed — no rankings were saved." }
      : {}),
    disagreementCount,
  } as any);

  logger.info(
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
        logger.warn({ err: err }, `[citationChecker] competitor snapshot insert failed:`);
      }
    }
  }

  // 2. Metrics history — one row per tracked metric so the trend chart has
  // a real data point from this run.
  try {
    const { recordCurrentMetrics } = await import("./lib/metricsSnapshot");
    await recordCurrentMetrics(brandId, { citationRate, totalChecks, totalCited });
  } catch (err) {
    logger.warn({ err: err }, `[citationChecker] metrics snapshot failed:`);
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
    logger.warn({ err: err }, `[citationChecker] hallucination detection failed:`);
  }

  // 4. Run-change alerts — diff this run's snapshots (written in step 2)
  // against the prior run's and persist alert_history rows. MUST run after
  // steps 2 + 3 so the visibility_score / hallucinations snapshots exist.
  // Best-effort: a failure here must never revert saved rankings.
  try {
    const { recordRunChangeAlerts } = await import("./lib/runChangeAlerts");
    await recordRunChangeAlerts(brandId);
  } catch (err) {
    logger.warn({ err: err }, `[citationChecker] run-change alerts failed:`);
  }

  return { totalChecks, totalCited, rankings, runId: citationRun.id, done: true };
}

// ---- Wave 9: async kickoff path ----------------------------------------
//
// `runBrandPrompts` can take 30-120s for a full run (10 prompts × 5
// platforms). Vercel's 60s function cap forces us to bound the kickoff
// path: we run inline up to a deadline, then return what's done; the
// client's /advance polling loop drives the remainder to completion.
//
// `kickoffBrandPromptsRun` is the front door: it synchronously creates
// the citation_runs row (the partial unique index from migration 0035
// makes duplicate concurrent kickoffs throw a 23505 we surface as 409),
// then runs the deadline-bounded slice and returns the runId. The
// client polls /state to render progress.

export type KickoffResult =
  | { ok: true; runId: string }
  | { ok: false; reason: "already_running"; runId: string }
  | { ok: false; reason: "race"; runId: null };

export async function kickoffBrandPromptsRun(
  brandId: string,
  platforms: string[] = [...DEFAULT_CITATION_PLATFORMS],
  options: {
    triggeredBy?: "manual" | "cron" | "auto_onboarding";
    promptIds?: string[];
  } = {},
): Promise<KickoffResult> {
  const triggeredBy = options.triggeredBy ?? "manual";
  const newRow = () =>
    storage.createCitationRun({
      brandId,
      triggeredBy,
      totalChecks: 0,
      totalCited: 0,
      citationRate: 0,
      status: "running",
      progressPct: 0,
    } as any);

  let runId: string;
  try {
    const created = await newRow();
    runId = created.id;
  } catch (err: any) {
    // 23505 = unique_violation on citation_runs_one_active_per_brand.
    if (err?.code !== "23505") throw err;
    const active = await storage.getActiveCitationRuns(brandId);
    const existing = active[0];
    if (existing) {
      logger.info(
        { brandId, existingRunId: existing.id },
        "citation.run.kickoff.duplicate_blocked",
      );
      return { ok: false, reason: "already_running", runId: existing.id };
    }
    // Wave 9.2: race window — the partial unique index tripped, but
    // by the time we re-read active runs, the conflicting row has
    // already finalized. Retry the insert exactly once. If it still
    // collides, surface as a "race" result; the caller (route) returns
    // 500 with a generic "couldn't start run — try again" message.
    // Bounded so we can never recurse on a pathological loop.
    try {
      const retry = await newRow();
      runId = retry.id;
    } catch (retryErr: any) {
      logger.warn({ err: retryErr, brandId }, "citation.run.kickoff.race_after_retry");
      return { ok: false, reason: "race", runId: null };
    }
  }

  // Run synchronously up to a deadline that keeps us inside the function
  // timeout. If the run finishes within that window the kickoff returns
  // done; if not, the run stays in 'running' state and the client's
  // /advance polling drives it to completion. ~30s budget keeps us
  // safely under the 60s function cap: ~3s cold start + ~2s setup +
  // 30s of work + up to 20s LLM-call tail (Perplexity occasionally
  // returns at 18s) + ~2s response flush = ~57s.
  const deadlineMs = Date.now() + 30_000;
  try {
    await runBrandPrompts(brandId, platforms, { ...options, runId, deadlineMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, brandId, runId }, "citation.run.kickoff_inline_failed");
    try {
      await storage.updateCitationRun(runId, {
        status: "failed",
        progressPct: 100,
        completedAt: new Date(),
        errorMessage: msg.slice(0, 500),
      } as never);
    } catch (writeErr) {
      logger.error({ err: writeErr, runId }, "citation.run.failure_write_failed");
    }
  }

  return { ok: true, runId };
}

// Advance one slice of an in-progress citation run. Used by the client's
// polling loop and the cron drain step. Resumes by querying existing
// geo_rankings for the run and skipping completed pairs. Idempotent:
// calling on an already-terminal run is a no-op.
export async function advanceCitationRun(
  runId: string,
  deadlineMs: number,
): Promise<{ done: boolean; status: string }> {
  const run = await storage.getCitationRunById(runId);
  if (!run) return { done: true, status: "missing" };
  if (run.status !== "pending" && run.status !== "running") {
    return { done: true, status: run.status };
  }
  try {
    // Per-run advisory lock so that concurrent /advance calls (the
    // browser polling loop alone can fire one every second under load)
    // can't double-process the same (prompt, platform) pairs and insert
    // duplicate geo_rankings rows. If another slice is mid-flight we
    // return the run's current status so the caller can keep polling.
    const lockResult = await withDynamicAdvisoryLock(
      dynamicLockNamespaces.citationRunSlice,
      runId,
      "citation-run-slice",
      () =>
        runBrandPrompts(run.brandId, undefined, {
          runId,
          resume: true,
          deadlineMs,
        }),
    );
    if (!lockResult.ran) {
      return { done: false, status: run.status };
    }
    const result = lockResult.result;
    return { done: result.done, status: result.done ? "succeeded" : "running" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, runId }, "citation.run.advance_failed");
    try {
      await storage.updateCitationRun(runId, {
        status: "failed",
        progressPct: 100,
        completedAt: new Date(),
        errorMessage: msg.slice(0, 500),
      } as never);
    } catch {
      // best effort
    }
    return { done: true, status: "failed" };
  }
}
