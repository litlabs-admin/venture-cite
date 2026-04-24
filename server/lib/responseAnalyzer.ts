import OpenAI from "openai";
import { z } from "zod";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { parseLLMJson, LLMParseError } from "./llmParse";
import { logger } from "./logger";
import { matchEntity, type TrackedEntity as MatcherEntity } from "./brandMatcher";

// Merged extract+judge analyzer. One call per AI-chatbot response returns
// every brand mentioned plus cited/rank/relevance/context/citedUrls, replacing
// the N+1 per-entity judge loop (brand judge + one judge per competitor +
// separate auto-discovery pass). See plan file: tidy-wandering-gem.md — Wave A.
//
// Cost: one gpt-4o-mini call per response (~$0.0003 with typical inputs).
// A full citation run with 30 prompts × 5 platforms = 150 analyzer calls.

const analyzerClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(analyzerClient);

const ANALYZER_MODEL = MODELS.misc;
const MAX_RESPONSE_CHARS = 8000;
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
  variants: z.array(z.string().min(1).max(120)).max(MAX_VARIANTS_PER_BRAND),
  cited: z.boolean(),
  rank: z.number().int().positive().nullable(),
  relevance: z.number().min(0).max(100),
  context: z.string().max(1200).default(""),
  citedUrls: z.array(z.string().max(400)).max(MAX_URLS_PER_BRAND).default([]),
});

const analyzerOutputSchema = z.object({
  brands: z.record(z.string().min(1).max(160), brandEntrySchema),
});

export type BrandAnalysis = z.infer<typeof brandEntrySchema> & { name: string };

export interface AnalyzedResponse {
  brands: BrandAnalysis[];
  tracked: {
    // name-key of tracked entity → matched brand analysis (or null if not
    // surfaced by the analyzer — treated as not cited)
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
      return parts.join(" — ");
    })
    .join("\n");
}

const SYSTEM_PROMPT = `You analyse one AI-chatbot response to a user question. You extract every company/product brand mentioned in the response and, for each, return citation details.

Rules:
- Include ONLY real company/product/service brands. Exclude generic category terms ("CRM software", "PR agency"), publications ("Forbes", "TechCrunch"), and generic English words that only coincidentally match a brand name.
- A brand is "cited" if it is explicitly referenced by name, domain, or unambiguous description AS AN ANSWER or CONTRIBUTOR to the user question. Being named only as an aside, comparison target, or disclaimer counts as NOT cited. Generic words matching a brand name by coincidence (e.g. "the notion of X" when a brand called "Notion" exists) are NOT cited.
- "variants" is every surface form the brand appears as in the response (name, domain, alternate casing). Up to 5.
- "rank" is the 1-indexed position of the brand's first appearance inside an ordered or numbered list/ranking in the response. If the brand is not inside such a list, use null.
- "relevance" is 0-100: how favourably and directly this brand is presented in answering the user question. 100 = top recommendation with explicit endorsement; 50 = mentioned neutrally; 0 = mentioned negatively or in passing.
- "context" is a short snippet (max ~200 chars) from the response showing HOW the brand was referenced.
- "citedUrls" is any source URLs the response attributes to this brand (e.g. "according to hubspot.com/blog/..."). Empty array if none.

Return JSON ONLY in this exact shape:
{
  "brands": {
    "HubSpot": {"variants": ["HubSpot", "HubSpot CRM"], "cited": true, "rank": 1, "relevance": 90, "context": "HubSpot leads this list...", "citedUrls": ["hubspot.com/blog/..."]},
    "Salesforce": {"variants": ["Salesforce"], "cited": true, "rank": 2, "relevance": 75, "context": "...", "citedUrls": []}
  }
}

Include every brand you detect — the user will match against their tracked set and treat extras as auto-discovery candidates.`;

/**
 * Run a single merged extract+judge analysis call on one response. Returns
 * {brands, tracked, untracked} where `tracked` maps each tracked entity ID
 * to its BrandAnalysis (or null if not surfaced), and `untracked` lists
 * every analyzer-returned brand that didn't match a tracked entity.
 *
 * Fail-closed: on any LLM or parse error, returns empty analysis — callers
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
  if (!process.env.OPENAI_API_KEY) {
    logger.warn("responseAnalyzer: OPENAI_API_KEY missing — skipping analysis");
    return emptyResult;
  }

  const truncated =
    responseText.length > MAX_RESPONSE_CHARS
      ? responseText.slice(0, MAX_RESPONSE_CHARS)
      : responseText;
  const userMsg = `Tracked entities (the user's brand and their competitors — treat these with priority but also surface any OTHER brands you find):
${buildEntityBlock(trackedEntities)}

Response text:
"""
${truncated}
"""

Respond with JSON only.`;

  let parsed: z.infer<typeof analyzerOutputSchema>;
  try {
    const completion = await analyzerClient.chat.completions.create({
      model: ANALYZER_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 1400,
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
 * not-cited rows — sentiment is only meaningful when the brand appeared.
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
