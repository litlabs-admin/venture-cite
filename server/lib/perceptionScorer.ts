// Brand perception scoring - five axes (trust/quality/value/market/
// innovation) judged strictly from what AI models actually said about the
// brand in stored citation-check responses. See migrations/0088_brand_
// perception_runs.sql for the honesty constraints this module must uphold:
// an axis the judge cannot assess from the evidence must come back NULL,
// never a guessed/middling number.

import OpenAI from "openai";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { LLM_CALL_TIMEOUT_MS } from "./factAgent/v2/vercelBudget";

// Constructed LAZILY, on first scoring call - never at import time.
//
// server/routes/dashboard.ts imports this module, so an eager `new OpenAI()`
// here made merely IMPORTING the dashboard routes throw "Missing credentials"
// whenever OPENAI_API_KEY was absent. That broke every unit test touching
// those routes (siteHealth, dashboardRecommendationInputs) and would equally
// break any environment that boots the API without an OpenAI key - a missing
// LLM key should disable scoring, not the dashboard.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: LLM_CALL_TIMEOUT_MS,
      maxRetries: 1,
    });
    attachAiLogger(_openai);
  }
  return _openai;
}

// Same delimiter used by hallucinationDetector.ts / competitorDiscovery.ts -
// geo_rankings.citation_context is stored as
// "{statusLine}\n\n||| RAW_RESPONSE |||\n{rawModelAnswer}".
const RAW_DELIM = "||| RAW_RESPONSE |||";

const MIN_SNIPPET_CHARS = 80;
const MAX_SNIPPET_CHARS = 1200;

export interface EvidenceRow {
  citationContext: string | null;
  aiPlatform: string;
}

export interface EvidenceSnippet {
  text: string;
  platform: string;
}

/**
 * Pure function: turn raw geo_rankings rows into a capped, cross-platform
 * sample of "what the model actually said" snippets for the judge prompt.
 *
 * Round-robins across platforms (in first-seen order) so one chatty
 * platform can't fill the whole evidence sample.
 */
/** Escape a brand name for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary matcher for the brand and its aliases. Word boundaries matter:
 *  a brand called "Notion" must not match "notional", and "Apple" must not
 *  match "applesauce". Aliases carry the bare domain ("venturepr") so a snippet
 *  that only cites the site still counts. */
export function buildBrandMatcher(brandName: string, aliases: string[] = []): RegExp | null {
  const terms = [brandName, ...aliases]
    .map((t) => (t ?? "").trim())
    .filter((t) => t.length >= 2)
    .map(escapeRe);
  if (terms.length === 0) return null;
  return new RegExp(`(^|[^a-z0-9])(${terms.join("|")})([^a-z0-9]|$)`, "i");
}

/** Cut a window around the FIRST brand mention so the judge reads the part of
 *  the answer that is actually about this brand, not 1200 characters of a
 *  competitor comparison that happens to name it once at the end. */
export function focusOnBrand(text: string, matcher: RegExp, window = MAX_SNIPPET_CHARS): string {
  const m = matcher.exec(text);
  if (!m || m.index === undefined) return text.slice(0, window);
  const centre = m.index;
  const half = Math.floor(window / 2);
  const start = Math.max(0, centre - half);
  return text.slice(start, start + window);
}

export function gatherEvidence(
  rows: EvidenceRow[],
  opts: { maxSnippets?: number; brandName?: string; aliases?: string[] } = {},
): EvidenceSnippet[] {
  const maxSnippets = opts.maxSnippets ?? 40;
  // BRAND RELEVANCE. citation_context holds the model's answer to a prompt we
  // checked the brand against - NOT necessarily an answer about the brand. A
  // prompt like "best PR agencies" returns a paragraph that may never mention
  // this customer. Scoring "how is this brand perceived" from text that does
  // not discuss it is exactly the fabrication the rest of this pipeline
  // avoids, so snippets with no brand mention are DROPPED, and the ones kept
  // are re-centred on the mention.
  //
  // When no brand name is supplied the filter is skipped (older callers /
  // tests), but the endpoint always passes one.
  const matcher = opts.brandName ? buildBrandMatcher(opts.brandName, opts.aliases) : null;

  const byPlatform = new Map<string, string[]>();
  const platformOrder: string[] = [];

  for (const row of rows) {
    const raw = row.citationContext;
    if (!raw) continue;
    const idx = raw.indexOf(RAW_DELIM);
    const extracted = idx === -1 ? raw : raw.slice(idx + RAW_DELIM.length);
    const trimmed = extracted.trim();
    if (trimmed.length < MIN_SNIPPET_CHARS) continue;
    if (matcher && !matcher.test(trimmed)) continue;
    const truncated = matcher
      ? focusOnBrand(trimmed, matcher)
      : trimmed.length > MAX_SNIPPET_CHARS
        ? trimmed.slice(0, MAX_SNIPPET_CHARS)
        : trimmed;

    if (!byPlatform.has(row.aiPlatform)) {
      byPlatform.set(row.aiPlatform, []);
      platformOrder.push(row.aiPlatform);
    }
    byPlatform.get(row.aiPlatform)!.push(truncated);
  }

  const out: EvidenceSnippet[] = [];
  let anyLeft = true;
  while (anyLeft && out.length < maxSnippets) {
    anyLeft = false;
    for (const platform of platformOrder) {
      if (out.length >= maxSnippets) break;
      const queue = byPlatform.get(platform)!;
      if (queue.length === 0) continue;
      out.push({ text: queue.shift()!, platform });
      if (queue.length > 0) anyLeft = true;
    }
  }

  return out;
}

export type PerceptionAxis = "trust" | "quality" | "value" | "market" | "innovation";
export const PERCEPTION_AXES: PerceptionAxis[] = [
  "trust",
  "quality",
  "value",
  "market",
  "innovation",
];

export interface PerceptionScore {
  trust: number | null;
  quality: number | null;
  value: number | null;
  market: number | null;
  innovation: number | null;
  praised: string[];
  questioned: string[];
}

const MAX_LIST_ITEMS = 8;
const MAX_ITEM_CHARS = 60;

// One decimal of precision (matches the numeric(4,1) storage column and the
// reference product's 66.6 / 65.8-style scores) - still clamped 0-100, still
// null for anything non-numeric/out-of-range.
function coerceAxis(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}

function coerceStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, MAX_LIST_ITEMS)
    .map((v) => v.trim().slice(0, MAX_ITEM_CHARS));
}

/**
 * Pure validator for the judge's raw JSON response. Never guesses: any
 * axis that is missing, non-numeric, or out of range becomes null rather
 * than a fabricated default.
 */
export function parseScoreResponse(raw: string): PerceptionScore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("perceptionScorer: malformed JSON from judge");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("perceptionScorer: judge response was not a JSON object");
  }
  const obj = parsed as Record<string, unknown>;

  return {
    trust: coerceAxis(obj.trust),
    quality: coerceAxis(obj.quality),
    value: coerceAxis(obj.value),
    market: coerceAxis(obj.market),
    innovation: coerceAxis(obj.innovation),
    praised: coerceStringList(obj.praised),
    questioned: coerceStringList(obj.questioned),
  };
}

/**
 * Mean of the non-null axes, rounded. Null axes are excluded from both the
 * numerator and denominator - never treated as zero. Returns null only
 * when every axis is null.
 */
export function computeOverall(axes: {
  trust: number | null;
  quality: number | null;
  value: number | null;
  market: number | null;
  innovation: number | null;
}): number | null {
  const values = PERCEPTION_AXES.map((axis) => axes[axis]).filter(
    (v): v is number => typeof v === "number",
  );
  if (values.length === 0) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(mean * 10) / 10;
}

export interface ScoreBrandPerceptionResult extends PerceptionScore {
  overall: number | null;
  evidenceCount: number;
  model: string | null;
}

/**
 * Judge brand perception from the supplied evidence only. If there is no
 * evidence, returns an all-null result WITHOUT calling the LLM - a run
 * with zero real snippets must never fabricate a score.
 */
export async function scoreBrandPerception({
  brandName,
  evidence,
  // Default resolved at CALL time, not import time - see getOpenAI().
  client,
}: {
  brandName: string;
  evidence: EvidenceSnippet[];
  client?: OpenAI;
}): Promise<ScoreBrandPerceptionResult> {
  if (evidence.length === 0) {
    return {
      trust: null,
      quality: null,
      value: null,
      market: null,
      innovation: null,
      overall: null,
      praised: [],
      questioned: [],
      evidenceCount: 0,
      model: null,
    };
  }

  const evidenceBlock = evidence
    .map((e, i) => `[${i + 1}] (${e.platform}): """${e.text}"""`)
    .join("\n\n");

  const completion = await (client ?? getOpenAI()).chat.completions.create({
    model: MODELS.misc,
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content: `You are a brand perception analyst. You will be given excerpts of what various AI models actually said when asked about the brand "${brandName}". Score the brand's perception ONLY from these excerpts.

HARD RULES:
- Score ONLY from the supplied excerpts. Do NOT use outside knowledge about the brand and do NOT guess.
- If an axis cannot be judged from the evidence, return null for that axis. Do NOT default to a middling number (e.g. 50) when unsure.
- "praised" and "questioned" must be short noun phrases quoted or closely paraphrased FROM the excerpts - never invented.

Axes (each a number 0-100 with ONE DECIMAL of precision, e.g. 66.6, or null):
- trust: how much the excerpts suggest the brand is trustworthy/reliable
- quality: perceived product/service quality
- value: perceived value for money
- market: perceived market position/reputation
- innovation: perceived innovativeness

Return STRICT JSON exactly in this shape:
{"trust": number|null, "quality": number|null, "value": number|null, "market": number|null, "innovation": number|null, "praised": string[], "questioned": string[]}`,
      },
      {
        role: "user",
        content: `Excerpts:\n\n${evidenceBlock}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const scored = parseScoreResponse(raw);
  const overall = computeOverall(scored);

  return {
    ...scored,
    overall,
    evidenceCount: evidence.length,
    model: MODELS.misc,
  };
}
