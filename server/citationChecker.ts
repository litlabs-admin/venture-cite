import OpenAI from "openai";
import { storage } from "./storage";
import type { GeoRanking, Brand } from "@shared/schema";
import { attachAiLogger } from "./lib/aiLogger";
import { MODELS, OPENROUTER_BASE_URL } from "./lib/modelConfig";

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

export const DEFAULT_CITATION_PLATFORMS = ['ChatGPT', 'Perplexity', 'DeepSeek', 'Claude', 'Gemini'] as const;

const COMPANY_SUFFIX_RE = /\b(inc|inc\.|llc|ltd|ltd\.|co|co\.|corp|corporation|company|gmbh|s\.?a\.?|plc|pty|limited|labs|technologies|technology|software|holdings|group)\b/gi;

// Strip legal suffixes and normalize whitespace/punctuation so "Notion Labs,
// Inc." also matches responses that just say "Notion".
function normalizeBrandName(name: string): string {
  return name
    .replace(COMPANY_SUFFIX_RE, "")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build the set of name variants we should search for in a response. Order
// matters — the longest variant is tried first so the match snippet is as
// specific as possible.
export function buildBrandNameVariants(
  brandName: string,
  extraVariations: string[] = [],
): string[] {
  const raw = [brandName, ...extraVariations].filter((s) => typeof s === "string" && s.trim().length > 0);
  const set = new Set<string>();
  for (const r of raw) {
    const trimmed = r.trim();
    if (trimmed.length >= 3) set.add(trimmed.toLowerCase());
    const normalized = normalizeBrandName(trimmed).toLowerCase();
    if (normalized.length >= 3) set.add(normalized);
    // Also index each individual word ≥ 4 chars — so "Notion Labs" also
    // matches a response that only mentions "Notion".
    for (const word of normalized.split(/\s+/)) {
      if (word.length >= 4) set.add(word);
    }
  }
  // Sort longest → shortest so the most specific match wins.
  return Array.from(set).sort((a, b) => b.length - a.length);
}

// Heuristic brand-mention detector used by every platform's response parser.
// Pure binary — either the brand name (or one of its variants) appears in the
// response or it doesn't. No context snippet, no fuzzy keyword matching.
export function checkForCitation(
  responseText: string,
  brandName: string,
  extraVariations: string[] = [],
): { isCited: boolean; rank: number | null } {
  if (!brandName) return { isCited: false, rank: null };

  const lowerResponse = responseText.toLowerCase();
  const variants = buildBrandNameVariants(brandName, extraVariations);

  for (const variant of variants) {
    // Word-boundary match so "co" doesn't match "companies". Escape regex
    // specials, then wrap in \b to require token boundaries.
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    const match = re.exec(responseText);
    if (match && match.index !== undefined) {
      const beforeMention = lowerResponse.substring(0, match.index);
      const rank = (beforeMention.match(new RegExp(`\\b${escaped}\\b`, "gi")) || []).length + 1;
      return { isCited: true, rank };
    }
  }

  return { isCited: false, rank: null };
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
export async function runPlatformCitationCheck(
  platform: string,
  prompt: string,
  _brand: Brand | null,
  brandName: string,
  brandNameVariations: string[] = [],
): Promise<{ isCited: boolean; rank: number | null; responseText: string; error?: string }> {
  const systemMsg = "You are a helpful assistant. Answer the question thoroughly, citing specific sources, brands, companies, or products when relevant.";

  if (platform === 'ChatGPT' || platform === 'GPT-4') {
    const chatResponse = await openai.chat.completions.create({
      model: MODELS.citationChatGPT,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });
    const responseText = chatResponse.choices[0].message.content || '';
    const r = checkForCitation(responseText, brandName, brandNameVariations);
    return { isCited: r.isCited, rank: r.rank, responseText };
  }

  const openrouterModel = OPENROUTER_MODEL_BY_PLATFORM[platform];
  if (!openrouterModel) {
    return { isCited: false, rank: null, responseText: '', error: `Unknown citation platform: ${platform}` };
  }

  if (!openrouter) {
    return {
      isCited: false,
      rank: null,
      responseText: '',
      error: `${platform} check skipped — OPENROUTER_API_KEY is not configured.`,
    };
  }

  const chatResponse = await openrouter.chat.completions.create({
    model: openrouterModel,
    messages: [
      { role: "system", content: `You are ${platform}, a helpful AI assistant. ${systemMsg}` },
      { role: "user", content: prompt },
    ],
    max_tokens: 1500,
    temperature: 0.7,
  });
  const responseText = chatResponse.choices[0]?.message?.content || '';
  const r = checkForCitation(responseText, brandName, brandNameVariations);
  return { isCited: r.isCited, rank: r.rank, responseText };
}

// Runs every stored prompt for a brand across each platform and persists a
// geo_rankings row per (prompt, platform) pair. Shared between the API
// endpoint and the weekly scheduler.
export async function runBrandPrompts(
  brandId: string,
  platforms: string[] = [...DEFAULT_CITATION_PLATFORMS],
  options: { triggeredBy?: "manual" | "cron"; runId?: string } = {},
): Promise<{ totalChecks: number; totalCited: number; rankings: GeoRanking[]; runId: string | null }> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("Brand not found");
  const brandName = brand.companyName || brand.name || '';
  // Pass every name we know about — short name, company name, and any
  // stored variations — into the detector so "Notion Labs, Inc." also
  // matches a response that just says "Notion".
  const brandNameVariations = [
    brand.name || '',
    brand.companyName || '',
    ...(Array.isArray(brand.nameVariations) ? brand.nameVariations : []),
  ].filter((s) => typeof s === 'string' && s.trim().length > 0);
  const prompts = await storage.getBrandPromptsByBrandId(brandId);
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

  // Flatten all (prompt × platform) pairs into one queue and run them with a
  // fixed concurrency ceiling. As soon as one task finishes (AI call + DB
  // insert) the next one starts — no per-prompt batching, no waiting for the
  // slowest sibling. Concurrency = 5 keeps the burst size predictable and
  // well under every platform's rate limit.
  const CONCURRENCY = 5;

  type Task = { bp: typeof prompts[number]; promptIdx: number; platform: string };
  const queue: Task[] = [];
  prompts.forEach((bp, i) => {
    for (const platform of cappedPlatforms) {
      queue.push({ bp, promptIdx: i + 1, platform });
    }
  });

  console.log(`[citationChecker] starting ${prompts.length} prompts × ${cappedPlatforms.length} platforms = ${queue.length} checks (concurrency=${CONCURRENCY})`);

  let cursor = 0;
  const runOne = async (task: Task): Promise<void> => {
    const { bp, promptIdx, platform } = task;
    let isCited = false;
    let citationContext: string | null = null;
    let rank: number | null = null;
    const started = Date.now();
    try {
      const result = await runPlatformCitationCheck(platform, bp.prompt, brand, brandName, brandNameVariations);
      isCited = result.isCited;
      rank = result.rank;
      if (result.error) {
        citationContext = result.error;
      } else {
        // Persist the full AI response so the UI can render it as markdown.
        // Status line + `||| RAW_RESPONSE |||` delimiter so the API can split
        // the two back out on the way to the client.
        const statusLine = isCited ? "Cited" : "Not cited";
        citationContext = `${statusLine}\n\n||| RAW_RESPONSE |||\n${result.responseText}`;
      }
      console.log(`[citationChecker] prompt ${promptIdx} ${platform} ok in ${Date.now() - started}ms — cited=${isCited}`);
    } catch (apiError) {
      const msg = apiError instanceof Error ? apiError.message : 'API error';
      citationContext = `Check failed: ${msg}`;
      console.error(`[citationChecker] prompt ${promptIdx} ${platform} FAILED in ${Date.now() - started}ms —`, msg);
    }

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
        checkedAt: new Date(),
      } as any);
      rankings.push(row);
      if (isCited) totalCited += 1;
      console.log(`[citationChecker] prompt ${promptIdx} ${platform} saved at ${Date.now() - started}ms`);
    } catch (dbErr) {
      console.error(`[citationChecker] prompt ${promptIdx} ${platform} DB insert failed —`, dbErr instanceof Error ? dbErr.message : dbErr);
    }
  };

  const worker = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= queue.length) return;
      await runOne(queue[idx]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
  );

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
    Array.from(platformMap.entries()).map(([p, s]) => [p, { ...s, rate: s.checks > 0 ? Math.round((s.cited / s.checks) * 100) : 0 }]),
  );
  await storage.updateCitationRun(citationRun.id, {
    totalChecks,
    totalCited,
    citationRate,
    completedAt: new Date(),
    platformBreakdown,
  });

  console.log(`[citationChecker] run ${citationRun.id} complete — ${totalCited}/${totalChecks} cited (${citationRate}%)`);

  return { totalChecks, totalCited, rankings, runId: citationRun.id };
}
