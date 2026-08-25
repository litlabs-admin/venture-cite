import { z } from "zod";
import { MODELS } from "./modelConfig";
import { getOpenrouterClient } from "./factAgent/v2/openrouterClient";
import { parseLLMJson, LLMParseError } from "./llmParse";
import { logger } from "./logger";
import { matchEntity, type TrackedEntity as MatcherEntity } from "./brandMatcher";
import { LLM_CALL_TIMEOUT_MS } from "./factAgent/v2/vercelBudget";

// Merged extract+judge analyzer. One call per AI-chatbot response returns
// every brand mentioned plus cited/rank/relevance/context/citedUrls, replacing
// the N+1 per-entity judge loop (brand judge + one judge per competitor +
// separate auto-discovery pass). See plan file: tidy-wandering-gem.md - Wave A.
//
// Cost: one call per response. A full citation run with 30 prompts × 5
// platforms = 150 analyzer calls.

const ANALYZER_MODEL = MODELS.citationBrandExtraction;
const MAX_RESPONSE_CHARS = 8000;
// Post-parse trim targets only, from here down - NOT schema validators.
// A parsed-but-oversized response gets trimmed to these via .slice() after
// zod has already accepted it. The schema itself imposes no length/count
// ceilings on these fields anymore (see brandEntrySchema below): a strict
// zod .max() previously REJECTED THE ENTIRE MULTI-BRAND PAYLOAD whenever
// one brand exceeded it (e.g. 4 citedUrls when capped at 3) - real, richly
// detailed responses were being thrown away over a single oversized field
// we were going to trim anyway. Validate shape (string/number/boolean),
// not size.
const MAX_BRANDS_PER_RESPONSE = 25;
const MAX_VARIANTS_PER_BRAND = 5;
const MAX_URLS_PER_BRAND = 3;

export interface TrackedEntity {
  kind: "brand" | "competitor";
  id: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  description?: string | null;
  aliases?: string[] | null;
}

const brandEntrySchema = z.object({
  variants: z.array(z.string().min(1)),
  cited: z.boolean(),
  rank: z.number().int().positive().nullable(),
  relevance: z.number().min(0).max(100),
  context: z.string().default(""),
  citedUrls: z.array(z.string()).default([]),
});

const analyzerOutputSchema = z.object({
  brands: z.record(z.string().min(1), brandEntrySchema),
});

export type BrandAnalysis = z.infer<typeof brandEntrySchema> & { name: string };

export interface AnalyzedResponse {
  brands: BrandAnalysis[];
  tracked: {
    // name-key of tracked entity → matched brand analysis (or null if not
    // surfaced by the analyzer - treated as not cited)
    [entityId: string]: BrandAnalysis | null;
  };
  untracked: BrandAnalysis[]; // candidates for auto-discovery
}

function buildEntityBlock(trackedEntities: TrackedEntity[]): string {
  if (trackedEntities.length === 0) return "(none tracked)";
  return trackedEntities
    .map((e, i) => {
      const parts = [`${i + 1}. ${e.name}`];
      if (e.website) parts.push(`website: ${e.website}`);
      if (e.industry) parts.push(`industry: ${e.industry}`);
      if (e.description) parts.push(`desc: ${e.description.slice(0, 160)}`);
      if (e.aliases?.length) parts.push(`aliases: ${e.aliases.join(", ")}`);
      return parts.join(" - ");
    })
    .join("\n");
}

const SYSTEM_PROMPT = `You analyse one AI-chatbot response to a user question. You extract every company/product brand mentioned in the response and, for each, return citation details.

Rules:
- Include ONLY real company/product/service brands. Exclude generic category terms ("CRM software", "PR agency"), publications ("Forbes", "TechCrunch"), and generic English words that only coincidentally match a brand name.
- A brand is "cited" if it is explicitly referenced by name, domain, or unambiguous description AS AN ANSWER or CONTRIBUTOR to the user question. Being named only as an aside, comparison target, or disclaimer counts as NOT cited. Generic words matching a brand name by coincidence (e.g. "the notion of X" when a brand called "Notion" exists) are NOT cited.
- "variants" is every surface form the brand appears as in the response (name, domain, alternate casing). Up to 5 - if there are more, keep the 5 most distinct.
- "rank" is the 1-indexed position of the brand's first appearance inside an ordered or numbered list/ranking in the response. If the brand is not inside such a list, use null.
- "relevance" is 0-100: how favourably and directly this brand is presented in answering the user question. 100 = top recommendation with explicit endorsement; 50 = mentioned neutrally; 0 = mentioned negatively or in passing.
- "context" is a short snippet (max ~150 chars) from the response showing HOW the brand was referenced. Keep it tight - a full paragraph is not needed.
- "citedUrls" is any source URLs the response attributes to this brand (e.g. "according to hubspot.com/blog/..."). Up to 3 - if there are more, keep the 3 most specific. Empty array if none.
- If the response names more than 20 brands, return only the 20 most prominent (highest-ranked or most-discussed) - never truncate mid-brand, just include fewer complete entries.

Return JSON ONLY in this exact shape:
{
  "brands": {
    "HubSpot": {"variants": ["HubSpot", "HubSpot CRM"], "cited": true, "rank": 1, "relevance": 90, "context": "HubSpot leads this list...", "citedUrls": ["hubspot.com/blog/..."]},
    "Salesforce": {"variants": ["Salesforce"], "cited": true, "rank": 2, "relevance": 75, "context": "...", "citedUrls": []}
  }
}

Include every brand you detect - the user will match against their tracked set and treat extras as auto-discovery candidates.`;

/**
 * Run a single merged extract+judge analysis call on one response. Returns
 * {brands, tracked, untracked} where `tracked` maps each tracked entity ID
 * to its BrandAnalysis (or null if not surfaced), and `untracked` lists
 * every analyzer-returned brand that didn't match a tracked entity.
 *
 * Fail-closed: on any LLM or parse error, returns empty analysis - callers
 * treat this as "no citations detected" rather than propagating the error.
 */
export async function analyzeResponse(params: {
  responseText: string;
  trackedEntities: TrackedEntity[];
}): Promise<AnalyzedResponse> {
  const { responseText, trackedEntities } = params;
  const emptyResult: AnalyzedResponse = {
    brands: [],
    tracked: Object.fromEntries(trackedEntities.map((e) => [e.id, null])),
    untracked: [],
  };

  if (!responseText || responseText.length < 40) return emptyResult;
  const client = getOpenrouterClient();
  if (!client) {
    logger.warn("responseAnalyzer: OPENROUTER_API_KEY missing - skipping analysis");
    return emptyResult;
  }

  const truncated =
    responseText.length > MAX_RESPONSE_CHARS
      ? responseText.slice(0, MAX_RESPONSE_CHARS)
      : responseText;
  const userMsg = `Tracked entities (the user's brand and their competitors - treat these with priority but also surface any OTHER brands you find):
${buildEntityBlock(trackedEntities)}

Response text:
"""
${truncated}
"""

Respond with JSON only.`;

  let parsed: z.infer<typeof analyzerOutputSchema>;
  try {
    const completion = await client.chat.completions.create({
      model: ANALYZER_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      // 2026-08-25: bumped from 1400. Brand-dense responses (e.g. "list
      // the top PR agencies for X") name 10-15+ brands; each needs its own
      // variants/context/citedUrls in the JSON schema output, and 1400
      // tokens routinely got the response cut off mid-object - the API
      // returns a truncated, unparseable JSON string rather than an error,
      // so this silently produced mentionedBrands: [] for exactly the
      // responses with the MOST brands to show. A first bump to 4000
      // still truncated one worst-case response in live testing. Sized
      // this one with real headroom: ~20 brands (the prompt's own cap,
      // added alongside this bump) × ~200 tokens/entry (5 variants +
      // ~150-char context + 3 citedUrls + JSON punctuation) ≈ 4000 tokens
      // of actual content, so 6000 leaves ~50% margin instead of landing
      // right back at the edge.
      max_tokens: 6000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    });
    parsed = parseLLMJson(completion.choices[0]?.message?.content, analyzerOutputSchema);
  } catch (err) {
    if (err instanceof LLMParseError) {
      logger.warn(
        { err: err.message, raw: err.raw.slice(0, 200) },
        "responseAnalyzer: JSON malformed",
      );
      return emptyResult;
    }
    logger.warn({ err }, "responseAnalyzer: analyzer call failed");
    return emptyResult;
  }

  const rawEntries = Object.entries(parsed.brands).slice(0, MAX_BRANDS_PER_RESPONSE);
  const brands: BrandAnalysis[] = rawEntries.map(([name, entry]) => ({
    name,
    variants: (entry.variants?.length ? entry.variants : [name]).slice(0, MAX_VARIANTS_PER_BRAND),
    cited: entry.cited,
    rank: entry.cited ? entry.rank : null,
    relevance: Math.round(entry.relevance),
    context: entry.context ?? "",
    citedUrls: (entry.citedUrls ?? []).slice(0, MAX_URLS_PER_BRAND),
  }));

  // Match analyzer-surfaced brands to tracked entities by running each
  // tracked entity's variant matcher over the analyzer-returned name plus
  // its variants. Shared matcher handles whole-word, diacritic folding,
  // legal-suffix stripping, and ambiguous-word gating in one place.
  const toMatcherEntity = (e: TrackedEntity): MatcherEntity => ({
    id: e.id,
    name: e.name,
    nameVariations: e.aliases ?? [],
    website: e.website ?? null,
  });

  const tracked: Record<string, BrandAnalysis | null> = Object.fromEntries(
    trackedEntities.map((e) => [e.id, null]),
  );
  const untracked: BrandAnalysis[] = [];

  for (const b of brands) {
    // Concatenate the analyzer's name + variants into one mini-text. Running
    // the matcher over this is equivalent to "does any tracked entity's
    // variant set overlap with what the analyzer calls this brand?"
    const candidateText = [b.name, ...b.variants].join(" ");
    let matched: TrackedEntity | null = null;
    for (const e of trackedEntities) {
      const r = matchEntity(candidateText, toMatcherEntity(e));
      if (r.matched) {
        matched = e;
        break;
      }
    }
    if (matched) {
      const prev = tracked[matched.id];
      if (!prev || (b.cited && !prev.cited)) tracked[matched.id] = b;
    } else {
      untracked.push(b);
    }
  }

  return { brands, tracked, untracked };
}

/**
 * Derive a sentiment label from the judge's relevance score. Mirrors the
 * rule used by the brand_mentions writer (see citationChecker.ts). Null for
 * not-cited rows - sentiment is only meaningful when the brand appeared.
 */
export function deriveSentiment(
  relevance: number | null,
  cited: boolean,
): "positive" | "neutral" | "negative" | null {
  if (!cited) return null;
  if (relevance === null) return "neutral";
  if (relevance >= 70) return "positive";
  if (relevance >= 40) return "neutral";
  return "negative";
}
