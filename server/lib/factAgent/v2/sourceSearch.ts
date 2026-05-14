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
import { CURRENT_SCHEMA_VERSION, FactsResponseSchema, type Fact } from "@shared/factAgent/schema";
import { getOpenrouterClient } from "./openrouterClient";
import { filterByBrandDomain } from "./domainAllowlist";

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

Visit the brand's URL and closely-linked pages (about, team, pricing, contact, blog, press) and extract structured facts about the company. Return JSON only.

CRITICAL RULES:
1. Every fact MUST have a sourceUrl. Use the URL of the page you took the fact from.
2. Use only first-hand sources: the brand's own pages or their official social / press profiles (LinkedIn company page, Crunchbase organization, X/Twitter handle). Do not use Wikipedia, Reddit, or random blog posts.
3. Confidence 1.0 only for facts that appear verbatim in a source. 0.7-0.9 for paraphrased. ≤0.5 for inferred.
4. If you cannot find the brand or cannot verify any facts, return facts=[]. Do not invent.

Return JSON in exactly this shape:
{
  "facts": [
    {
      "domain": "identity"|"offerings"|"positioning"|"team"|"operations"|"credentials"|"growth"|"contact",
      "subcategory": "<short label>",
      "factKey": "<short label>",
      "factValue": "<value>",
      "valueType": "string"|"number"|"array",
      "valuePayload": null|object,
      "confidence": 0.0..1.0,
      "sourceExcerpt": "<verbatim snippet>",
      "sourceUrl": "<page URL>"
    }
  ]
}`;

function buildUserPrompt(args: RunSearchSourceArgs): string {
  const lines = [
    `Brand URL: ${args.brandUrl}`,
    args.brandName ? `Brand name: ${args.brandName}` : null,
    args.industry ? `Industry hint: ${args.industry}` : null,
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
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(args) },
        ],
      });
      return res.choices?.[0]?.message?.content ?? "";
    });
  } catch (err) {
    logger.warn({ err, brandId: args.brandId, runId: args.runId }, "sourceSearch: provider error");
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
            response_format: { type: "json_object" },
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

  // ── Domain-confusion guard ────────────────────────────────────────────────
  const before = parsedFacts.length;
  const filtered = filterByBrandDomain(parsedFacts, args.brandUrl);
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
