// Source 3: user-enrich. Reshapes the brand's user-provided fields into the
// canonical 8-domain fact schema with confidence=1.0 (user is authoritative).
//
// Two paths:
//   1. LLM (GPT direct) — semantically maps free-form fields to schema slots.
//      Concurrency-gated, JSON-mode response.
//   2. Deterministic fallback — straight column-to-fact mapping. Runs when
//      the LLM is unavailable. Source 3 must never fail the run.
import OpenAI from "openai";
import { withSlot } from "../../llmConcurrency";
import { MODELS } from "../../modelConfig";
import { logger } from "../../logger";
import { FactsResponseSchema, type Fact } from "@shared/factAgent/schema";

// Standalone client — avoids pulling in routesShared → ownership → db which
// requires DATABASE_URL and is not needed by this pure-LLM helper.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
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

The user typed these fields themselves during onboarding. Treat them as authoritative — confidence MUST be 1.0 on every fact. Do not invent or paraphrase beyond minimal cleanup.

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
      "factValue": "<the user's value, cleaned of whitespace only>",
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

function deterministicFallback(brand: UserEnrichBrand): Fact[] {
  const out: Fact[] = [];
  const push = (
    domain: Fact["domain"],
    subcategory: string,
    factKey: string,
    factValue: string,
    valueType: Fact["valueType"] = "string",
    valuePayload: Fact["valuePayload"] = null,
  ) => {
    if (!factValue) return;
    out.push({
      domain,
      subcategory,
      factKey,
      factValue,
      valueType,
      valuePayload,
      confidence: 1.0,
      sourceExcerpt: "",
    });
  };
  if (brand.name) push("identity", "description", "name", brand.name);
  if (brand.description) push("identity", "description", "description", brand.description);
  if (brand.industry) push("identity", "description", "industry", brand.industry);
  if (brand.products?.length) {
    push("offerings", "products", "products", brand.products.join(", "), "array", {
      items: brand.products,
    });
  }
  if (brand.targetAudience)
    push("positioning", "target_audience", "target_audience", brand.targetAudience);
  if (brand.uniqueSellingPoints?.length) {
    push(
      "positioning",
      "unique_selling_points",
      "unique_selling_points",
      brand.uniqueSellingPoints.join(", "),
      "array",
      { items: brand.uniqueSellingPoints },
    );
  }
  if (brand.keyValues) push("positioning", "values", "key_values", brand.keyValues);
  if (brand.brandVoice) push("positioning", "brand_voice", "brand_voice", brand.brandVoice);
  if (brand.tone) push("positioning", "brand_voice", "tone", brand.tone);
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
      const facts = v.data.facts.map((f) => ({ ...f, confidence: 1.0 }));
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
