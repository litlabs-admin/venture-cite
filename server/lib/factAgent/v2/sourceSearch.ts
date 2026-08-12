// Source 2: search-grounded LLM. Single Perplexity Sonar call via OpenRouter
// with brand-confusion guard + 24h cache.
//
// Inputs: brand context. Output: facts in the canonical 8-domain schema.
// Idempotent: cache key = "search-llm:<brandId>:<urlHash>:v<schemaVersion>".
// TTL: 24h on ≥1-fact response, 1h on empty, no cache on provider error.
import crypto from "node:crypto";
import { withSlot } from "../../llmConcurrency";
import { storage } from "../../../storage";
import { logger } from "../../logger";
import { MODELS } from "../../modelConfig";
import { isGenericIndustry } from "../../genericIndustry";
import {
  ALLOWED_KEYS,
  CURRENT_SCHEMA_VERSION,
  DOMAINS,
  FactsResponseSchema,
  buildFactsJsonSchema,
  isAllowedFactKey,
  type Domain,
  type Fact,
} from "@shared/factAgent/schema";
import { getOpenrouterClient } from "./openrouterClient";
import { filterByBrandDomain } from "./domainAllowlist";

// Reuse the same vocabulary block the static-source prompt uses so the
// search-LLM produces facts under controlled keys too. Without this, the
// search source dumped facts with free-form factKeys and the
// `isAllowedFactKey` post-filter dropped every one of them.
const VOCAB_BLOCK = DOMAINS.map(
  (d) => `  ${d}: ${(ALLOWED_KEYS[d] as readonly string[]).join(", ")}`,
).join("\n");

// Same strict JSON Schema the static-page extractor uses (extractionPrompt.ts).
// perplexity/sonar rejects `response_format: { type: "json_object" }` as of
// 2026-08 ("response_format.type must be one of json_schema, text"). Reusing
// this builder means the two facts sources can never drift in shape, and the
// API now enforces the shape itself instead of relying on prose.
const FACTS_JSON_SCHEMA = buildFactsJsonSchema();
// `json_schema` is typed as Record<string, unknown> upstream (built once for
// both OpenAI strict mode and this call), so cast at the call site the same
// way runFullScrape.ts does for its own responseFormat pass-through.
const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: FACTS_JSON_SCHEMA,
} as never;

export interface RunSearchSourceArgs {
  brandId: string;
  brandUrl: string;
  brandName?: string;
  industry?: string | null;
  runId?: string;
}

export type SearchSourceStatus = "done" | "failed" | "skipped";

export interface SearchSourceOutcome {
  status: SearchSourceStatus;
  facts: Fact[];
  errorKind: string | null;
  errorMessage: string | null;
  diagnostics: {
    cacheHit: boolean;
    provider: "perplexity" | null;
    repairUsed?: boolean;
    droppedOffAllowlist?: number;
    cappedToSocial?: number;
  };
}

const CACHE_TTL_SUCCESS_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_EMPTY_MS = 60 * 60 * 1000;

function cacheKey(brandId: string, brandUrl: string): string {
  const urlHash = crypto
    .createHash("sha256")
    .update(brandUrl.toLowerCase().replace(/\/$/, ""))
    .digest("hex")
    .slice(0, 16);
  return `search-llm:${brandId}:${urlHash}:v${CURRENT_SCHEMA_VERSION}`;
}

const SYSTEM_PROMPT = `You are a brand-facts researcher.

Visit the brand's URL and closely-linked pages (about, team, pricing, contact, blog, press) and extract structured facts about the company. The response schema is enforced - you cannot return anything else.

CRITICAL RULES:
1. Every fact MUST have a sourceUrl. Use the URL of the page you took the fact from.
2. Use only first-hand sources: the brand's own pages or their official social / press profiles (LinkedIn company page, Crunchbase organization, X/Twitter handle). Do not use Wikipedia, Reddit, or random blog posts.
3. Confidence 1.0 only for facts that appear verbatim in a source. 0.7-0.9 for paraphrased. ≤0.5 for inferred.
4. If you cannot find the brand or cannot verify any facts, return facts=[]. Do not invent.

CONTROLLED VOCABULARY - pick factKey from this list exactly. Do not invent new keys.
${VOCAB_BLOCK}

If a fact genuinely doesn't fit any of the above, use factKey="other" and put a short label in valuePayload.otherLabel.`;

function buildUserPrompt(args: RunSearchSourceArgs): string {
  const lines = [
    `Brand URL: ${args.brandUrl}`,
    args.brandName ? `Brand name: ${args.brandName}` : null,
    // Same gate as extractionPrompt.ts: a generic sector label anchors
    // the researcher onto the wrong market, so it is dropped entirely.
    args.industry && !isGenericIndustry(args.industry)
      ? `Industry hint (unverified - if the sources contradict it, the sources win): ${args.industry}`
      : null,
    "",
    "Visit the URL above and extract facts about THIS specific company (not other companies with similar names). Return JSON only.",
  ].filter(Boolean);
  return lines.join("\n");
}

export async function runSearchSource(args: RunSearchSourceArgs): Promise<SearchSourceOutcome> {
  const key = cacheKey(args.brandId, args.brandUrl);

  // ── Cache lookup ──────────────────────────────────────────────────────────
  const cached = await storage.getFactScrapeCache(key);
  if (cached) {
    const parsed = FactsResponseSchema.safeParse(cached.valueJson);
    if (parsed.success) {
      return {
        status: "done",
        facts: parsed.data.facts,
        errorKind: null,
        errorMessage: null,
        diagnostics: { cacheHit: true, provider: "perplexity" },
      };
    }
    logger.warn({ key }, "sourceSearch: cached row failed schema, refetching");
  }

  // ── Client availability ───────────────────────────────────────────────────
  const client = getOpenrouterClient();
  if (!client) {
    return {
      status: "skipped",
      facts: [],
      errorKind: "provider_unconfigured",
      errorMessage: "OPENROUTER_API_KEY not set; search-LLM source disabled",
      diagnostics: { cacheHit: false, provider: null },
    };
  }

  // ── Perplexity call ───────────────────────────────────────────────────────
  let raw: string;
  try {
    raw = await withSlot("perplexity", args.runId, async () => {
      const res = await client.chat.completions.create({
        model: MODELS.citationPerplexity,
        response_format: RESPONSE_FORMAT,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(args) },
        ],
      });
      return res.choices?.[0]?.message?.content ?? "";
    });
  } catch (err) {
    // This is the ONLY source of facts from live web search. A provider
    // rejection here silently zeroes out this whole source unless the log
    // says so - state the consequence, not just the error, so it is
    // greppable when the provider changes its API contract again.
    logger.warn(
      { err, brandId: args.brandId, runId: args.runId },
      "sourceSearch: provider error - search-LLM source contributed ZERO facts for this brand",
    );
    return {
      status: "failed",
      facts: [],
      errorKind: "llm_unavailable",
      errorMessage: (err as Error).message,
      diagnostics: { cacheHit: false, provider: "perplexity" },
    };
  }

  // ── Zod parse + repair retry ──────────────────────────────────────────────
  let parsedFacts: Fact[];
  let repairUsed = false;
  try {
    const json = JSON.parse(raw);
    const v = FactsResponseSchema.safeParse(json);
    if (v.success) {
      parsedFacts = v.data.facts;
    } else {
      repairUsed = true;
      const issueText = v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      let repairRaw = "";
      try {
        repairRaw = await withSlot("perplexity", args.runId, async () => {
          const res = await client.chat.completions.create({
            model: MODELS.citationPerplexity,
            response_format: RESPONSE_FORMAT,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: buildUserPrompt(args) },
              { role: "assistant", content: raw },
              {
                role: "user",
                content: `Your previous response failed schema validation: ${issueText}\nFix the JSON and return the same data in the required shape. JSON only.`,
              },
            ],
          });
          return res.choices?.[0]?.message?.content ?? "";
        });
      } catch (err) {
        logger.warn({ err, brandId: args.brandId }, "sourceSearch: repair call failed");
      }
      if (repairRaw) {
        const json2 = JSON.parse(repairRaw);
        const v2 = FactsResponseSchema.safeParse(json2);
        parsedFacts = v2.success ? v2.data.facts : [];
      } else {
        parsedFacts = [];
      }
    }
  } catch (err) {
    logger.warn({ err, brandId: args.brandId }, "sourceSearch: response unparseable");
    parsedFacts = [];
    repairUsed = true;
  }

  // ── Controlled-vocabulary guard ───────────────────────────────────────────
  // Drop any facts the LLM produced with factKeys outside the controlled
  // vocabulary. Mirrors the post-parse filter in extractionPrompt.ts so
  // the search source can't smuggle in synthetic keys that would later
  // be rejected at the persistFacts boundary anyway.
  const vocabFiltered = parsedFacts.filter((f) => isAllowedFactKey(f.domain as Domain, f.factKey));

  // ── Domain-confusion guard ────────────────────────────────────────────────
  const before = vocabFiltered.length;
  const filtered = filterByBrandDomain(vocabFiltered, args.brandUrl);
  const dropped = before - filtered.length;
  const cappedToSocial = filtered.filter((f) => f.confidence === 0.5).length;

  // ── Cache write ───────────────────────────────────────────────────────────
  const expiresAt = new Date(
    Date.now() + (filtered.length > 0 ? CACHE_TTL_SUCCESS_MS : CACHE_TTL_EMPTY_MS),
  );
  try {
    await storage.upsertFactScrapeCache({
      cacheKey: key,
      source: "search_llm",
      brandId: args.brandId,
      valueJson: { facts: filtered },
      expiresAt,
    });
  } catch (err) {
    logger.warn({ err, key }, "sourceSearch: cache write failed (non-fatal)");
  }

  return {
    status: "done",
    facts: filtered,
    errorKind: null,
    errorMessage: null,
    diagnostics: {
      cacheHit: false,
      provider: "perplexity",
      repairUsed,
      droppedOffAllowlist: dropped,
      cappedToSocial,
    },
  };
}
