// Source 3: user-enrich. Reshapes the brand's user-provided fields into the
// canonical 8-domain fact schema with confidence=1.0 (user is authoritative).
//
// Two paths:
//   1. LLM (GPT direct) - semantically maps free-form fields to schema slots.
//      Concurrency-gated, JSON-mode response.
//   2. Deterministic fallback - straight column-to-fact mapping. Runs when
//      the LLM is unavailable. Source 3 must never fail the run.
import OpenAI from "openai";
import { withSlot } from "../../llmConcurrency";
import { MODELS } from "../../modelConfig";
import { logger } from "../../logger";
import { FactsResponseSchema, type Fact } from "@shared/factAgent/schema";
import { LLM_CALL_TIMEOUT_MS } from "./vercelBudget";

// Standalone client - avoids pulling in routesShared → ownership → db which
// requires DATABASE_URL and is not needed by this pure-LLM helper.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Tier-aware: on Hobby (10s) this is ~6.3s, on Pro (60s) it's 25s.
  // The deterministic fallback below catches the case where the LLM
  // hits the deadline before returning a structured response.
  timeout: LLM_CALL_TIMEOUT_MS,
  maxRetries: 1,
});

export interface UserEnrichBrand {
  id: string;
  name?: string | null;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
  products?: string[] | null;
  targetAudience?: string | null;
  uniqueSellingPoints?: string[] | null;
  keyValues?: string | null;
  brandVoice?: string | null;
  tone?: string | null;
}

export interface RunUserEnrichArgs {
  brand: UserEnrichBrand;
  runId?: string;
}

export type UserEnrichStatus = "done" | "failed";

export interface UserEnrichOutcome {
  status: UserEnrichStatus;
  facts: Fact[];
  errorKind: string | null;
  errorMessage: string | null;
  diagnostics: { usedFallback: boolean };
}

const SYSTEM_PROMPT = `You are reshaping a brand's self-provided fields into a canonical fact schema.

The user typed these fields themselves during onboarding. Treat them as authoritative - confidence MUST be 1.0 on every fact. Do not invent or paraphrase beyond minimal cleanup.

Map fields to the 8-domain schema:
  identity:    name, description, tagline, mission
  offerings:   products, services, pricing_plans, integrations
  positioning: target_audience, unique_selling_points, brand_voice, tone
  team:        founders, leadership
  operations:  regions, locations
  credentials: certifications, awards, press
  growth:      funding_rounds, notable_customers
  contact:     email, phone, channels

Return JSON in exactly this shape:
{
  "facts": [
    {
      "domain": "identity"|"offerings"|"positioning"|"team"|"operations"|"credentials"|"growth"|"contact",
      "subcategory": "<short label matching the field>",
      "factKey": "<short label>",
      "factValue": "<the user's value, verbatim - preserve the spaces between words; only trim leading/trailing whitespace>",
      "valueType": "string"|"number"|"array",
      "valuePayload": null|object,
      "confidence": 1.0,
      "sourceExcerpt": ""
    }
  ]
}

Skip fields that are null, undefined, or empty strings/arrays. Return facts=[] if the brand has nothing populated.`;

function buildUserPrompt(brand: UserEnrichBrand): string {
  return [
    `Brand record (JSON):`,
    JSON.stringify(
      {
        name: brand.name ?? null,
        description: brand.description ?? null,
        industry: brand.industry ?? null,
        website: brand.website ?? null,
        products: brand.products ?? null,
        targetAudience: brand.targetAudience ?? null,
        uniqueSellingPoints: brand.uniqueSellingPoints ?? null,
        keyValues: brand.keyValues ?? null,
        brandVoice: brand.brandVoice ?? null,
        tone: brand.tone ?? null,
      },
      null,
      2,
    ),
  ].join("\n");
}

// The genuinely-safe interpretation of "clean whitespace": collapse internal
// runs of whitespace (newlines/tabs/double spaces) to a single space and trim
// the ends. Crucially it NEVER removes the single spaces between words - the
// old prompt wording ("cleaned of whitespace only") led the LLM to delete every
// space, producing values like "VenturePRspecializes…". Applied deterministically
// server-side so whitespace handling no longer depends on the model behaving.
function tidyWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const despace = (s: string): string => s.toLowerCase().replace(/\s+/g, "");

// Every authoritative source string the LLM was asked to echo verbatim. The
// model maps these into facts; when it does its job they round-trip unchanged.
function sourceStringsFor(brand: UserEnrichBrand): string[] {
  const out: string[] = [];
  const add = (v?: string | null) => {
    const t = (v ?? "").trim();
    if (t) out.push(t);
  };
  add(brand.name);
  add(brand.description);
  add(brand.industry);
  add(brand.targetAudience);
  add(brand.keyValues);
  add(brand.brandVoice);
  add(brand.tone);
  for (const p of brand.products ?? []) add(p);
  for (const u of brand.uniqueSellingPoints ?? []) add(u);
  return out;
}

// Deterministic repair for the exact failure mode behind "VenturePRspecializes…":
// a small model deletes the spaces from a value it was told to echo verbatim.
// tidyWhitespace can only COLLAPSE runs, never re-insert deleted spaces - but
// the authoritative source field still has them. If the model's value matches a
// source string once spaces+case are ignored, and that source is the longer
// (properly-spaced) form, snap back to the source. Exact despaced equality means
// we never alter meaning; non-matches (real paraphrase) are left untouched.
export function restoreSpacesFromSources(value: string, sources: string[]): string {
  const key = despace(value);
  if (!key) return value;
  for (const src of sources) {
    const tidy = tidyWhitespace(src);
    if (despace(tidy) === key && tidy.length > value.length) return tidy;
  }
  return value;
}

function deterministicFallback(brand: UserEnrichBrand): Fact[] {
  const out: Fact[] = [];
  // v2: subcategory is no longer in Fact - the server derives it from
  // (domain, factKey) before persistence. The push helper takes the
  // controlled-vocab key directly.
  const push = (
    domain: Fact["domain"],
    factKey: string,
    factValue: string,
    valueType: Fact["valueType"] = "string",
    valuePayload: Fact["valuePayload"] = null,
  ) => {
    if (!factValue) return;
    out.push({
      domain,
      factKey,
      factValue,
      valueType,
      valuePayload,
      confidence: 1.0,
      sourceExcerpt: "",
    });
  };
  if (brand.name) push("identity", "name", brand.name);
  if (brand.description) push("identity", "description", brand.description);
  if (brand.industry) push("identity", "industry", brand.industry);
  if (brand.products?.length) {
    push("offerings", "productLine", brand.products.join(", "), "array", {
      items: brand.products,
    });
  }
  if (brand.targetAudience) push("positioning", "targetAudience", brand.targetAudience);
  if (brand.uniqueSellingPoints?.length) {
    push("positioning", "differentiator", brand.uniqueSellingPoints.join(", "), "array", {
      items: brand.uniqueSellingPoints,
    });
  }
  if (brand.keyValues)
    push("positioning", "other", brand.keyValues, "string", { otherLabel: "values" });
  if (brand.brandVoice)
    push("positioning", "other", brand.brandVoice, "string", { otherLabel: "brand voice" });
  if (brand.tone) push("positioning", "tone", brand.tone);
  return out;
}

export async function runUserEnrichSource(args: RunUserEnrichArgs): Promise<UserEnrichOutcome> {
  try {
    const raw = await withSlot("openai", args.runId, async () => {
      const res = await openai.chat.completions.create({
        model: MODELS.misc,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(args.brand) },
        ],
      });
      return res.choices?.[0]?.message?.content ?? "";
    });
    const parsed = JSON.parse(raw as string);
    const v = FactsResponseSchema.safeParse(parsed);
    if (v.success) {
      const sources = sourceStringsFor(args.brand);
      const facts = v.data.facts.map((f) => ({
        ...f,
        // Collapse runs, then deterministically restore any spaces the model
        // deleted from a verbatim-echoed source field (the "VenturePRspecializes…" bug).
        factValue: restoreSpacesFromSources(tidyWhitespace(f.factValue), sources),
        confidence: 1.0,
      }));
      return {
        status: "done",
        facts,
        errorKind: null,
        errorMessage: null,
        diagnostics: { usedFallback: false },
      };
    }
    logger.warn(
      { brandId: args.brand.id, issues: v.error.issues },
      "sourceUserEnrich: LLM schema invalid, falling back",
    );
  } catch (err) {
    logger.warn({ err, brandId: args.brand.id }, "sourceUserEnrich: LLM call failed, falling back");
  }

  return {
    status: "done",
    facts: deterministicFallback(args.brand),
    errorKind: null,
    errorMessage: null,
    diagnostics: { usedFallback: true },
  };
}
