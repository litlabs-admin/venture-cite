import OpenAI from "openai";
import { z } from "zod";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { parseLLMJson, LLMParseError } from "./llmParse";
import { logger } from "./logger";
import type { Brand } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const RAW_DELIM = "||| RAW_RESPONSE |||";
const MAX_CITATION_SCAN = 50; // how many recent cited responses to mine

const discoveredCompetitorSchema = z.object({
  name: z.string().min(2).max(120),
  domain: z.string().max(255).optional().default(""),
  reason: z.string().max(500).optional(),
});
const competitorListSchema = z.object({
  competitors: z.array(discoveredCompetitorSchema).max(20),
});

type DiscoveredCompetitor = z.infer<typeof discoveredCompetitorSchema> & {
  source: "ai" | "citation_mining";
};

function normalizeDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

/**
 * Discover competitors for a brand from two sources:
 *   1. OpenAI inference from the brand profile (cheap baseline)
 *   2. Citation-context mining — extract brand names that AI engines mention
 *      alongside the user's brand in real citation results
 *
 * Dedup is handled at the DB level via the unique index on
 * (brand_id, lower(name), lower(coalesce(domain,''))) — createCompetitor
 * upserts, so there's no race window between parallel callers. Ignored /
 * soft-deleted rows stay tombstoned (lastSeenAt bumps, no revive).
 *
 * Returns the number of rows touched (inserts + revives + last_seen bumps).
 */
export async function discoverCompetitors(brandId: string): Promise<number> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) {
    logger.warn({ brandId }, "competitorDiscovery: brand not found — skipping");
    return 0;
  }
  if ((brand as any).deletedAt) {
    logger.info({ brandId }, "competitorDiscovery: brand is soft-deleted — skipping");
    return 0;
  }
  if (!process.env.OPENAI_API_KEY) {
    logger.warn({ brandId }, "competitorDiscovery: OPENAI_API_KEY missing — skipping");
    return 0;
  }

  // Only used to skip LLM calls that'd just produce ignored rows. DB
  // uniqueness still enforces correctness regardless.
  const existing = await storage.getCompetitors(brandId, { includeDeleted: true });
  const ignoredNameKeys = new Set(
    existing.filter((c) => (c as any).isIgnored === 1).map((c) => c.name.toLowerCase().trim()),
  );

  const candidates: DiscoveredCompetitor[] = [];

  try {
    const aiCompetitors = await inferCompetitorsFromProfile(brand);
    candidates.push(...aiCompetitors.map((c) => ({ ...c, source: "ai" as const })));
  } catch (err) {
    logger.warn({ err, brandId }, "competitorDiscovery: AI inference failed");
  }

  try {
    const mined = await mineCompetitorsFromCitations(brand);
    candidates.push(...mined.map((c) => ({ ...c, source: "citation_mining" as const })));
  } catch (err) {
    logger.warn({ err, brandId }, "competitorDiscovery: citation mining failed");
  }

  let touched = 0;
  const seenInBatch = new Set<string>();
  for (const cand of candidates) {
    const nameKey = cand.name.toLowerCase().trim();
    if (!nameKey || nameKey.length < 2) continue;
    if (seenInBatch.has(nameKey)) continue;
    seenInBatch.add(nameKey);
    if (ignoredNameKeys.has(nameKey)) continue;

    try {
      await storage.createCompetitor({
        brandId,
        name: cand.name.slice(0, 120),
        domain: normalizeDomain(cand.domain) || cand.domain || "",
        industry: brand.industry || null,
        description: cand.reason
          ? `[auto-discovered] ${cand.reason}`.slice(0, 500)
          : "[auto-discovered]",
        discoveredBy: cand.source,
      } as any);
      touched += 1;
    } catch (err) {
      logger.warn({ err, brandId, name: cand.name }, "competitorDiscovery: upsert failed");
    }
  }

  logger.info({ brandId, candidates: candidates.length, touched }, "competitorDiscovery: done");
  return touched;
}

/**
 * Single-response auto-discovery. Called from the citation run once per
 * (runId, platform): scans the response for companies that AREN'T already
 * in the brand's competitor list, validates them as real competitors, and
 * upserts the survivors with discoveredBy='citation_auto'.
 *
 * Return value = number of NEW rows inserted (upsert returns touched > 0
 * includes re-seen, which isn't what we want to report).
 */
export async function discoverCompetitorsFromResponse(params: {
  brandId: string;
  brand: Brand;
  responseText: string;
  existingCompetitorNames: string[];
}): Promise<number> {
  const { brandId, brand, responseText, existingCompetitorNames } = params;
  if (!process.env.OPENAI_API_KEY) return 0;
  if (!responseText || responseText.length < 80) return 0;

  const existingLower = new Set(existingCompetitorNames.map((n) => n.toLowerCase().trim()));

  const snippet = responseText.slice(0, 6000);
  let parsed;
  try {
    const completion = await openai.chat.completions.create({
      model: MODELS.misc,
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You extract REAL competitor companies from one AI-generated response that mentions a target brand. Rules:
- Only return real, currently-operating companies (no fictional, no defunct, no publishers/media outlets).
- Exclude the target brand itself.
- Exclude generic category terms ("CRM software", "PR agency", "retailers").
- Return at most 6 competitors.
- For each, provide name and primary domain if derivable.
Return JSON: {"competitors": [{"name": "...", "domain": "example.com"}]}`,
        },
        {
          role: "user",
          content: `Target brand: ${brand.name} (${brand.industry})
${brand.description ? `Description: ${brand.description}\n` : ""}
Response to mine:
${snippet}`,
        },
      ],
    });
    parsed = parseLLMJson(completion.choices[0]?.message?.content, competitorListSchema);
  } catch (err) {
    if (err instanceof LLMParseError) {
      logger.warn(
        { err: err.message, raw: err.raw.slice(0, 200), brandId },
        "competitorDiscovery: response-mining JSON malformed",
      );
      return 0;
    }
    throw err;
  }

  let inserted = 0;
  for (const cand of parsed.competitors) {
    const nameKey = cand.name.toLowerCase().trim();
    if (!nameKey || nameKey.length < 2) continue;
    if (existingLower.has(nameKey)) continue;
    existingLower.add(nameKey); // prevent within-batch dupes
    try {
      await storage.createCompetitor({
        brandId,
        name: cand.name.slice(0, 120),
        domain: normalizeDomain(cand.domain) || cand.domain || "",
        industry: brand.industry || null,
        description: "[auto-discovered from citation run]",
        discoveredBy: "citation_auto",
      } as any);
      inserted += 1;
    } catch (err) {
      logger.warn(
        { err, brandId, name: cand.name },
        "competitorDiscovery: response-mining upsert failed",
      );
    }
  }
  return inserted;
}

async function inferCompetitorsFromProfile(brand: Brand): Promise<DiscoveredCompetitor[]> {
  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0.3,
    response_format: { type: "json_object" },
    max_tokens: 1000,
    messages: [
      {
        role: "system",
        content: `You are a competitive intelligence analyst. Given a brand profile, return 5-10 real, direct competitors — companies that sell a substitutable product to the same audience. Rules:
- Only real, currently-operating companies
- No fictional names, no acquired companies, no parent companies
- For each, provide name, primary domain, and a short reason (why they compete)

Return JSON: {"competitors": [{"name": "...", "domain": "example.com", "reason": "..."}]}`,
      },
      {
        role: "user",
        content: `Brand: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Description: ${brand.description || "N/A"}
Products: ${Array.isArray(brand.products) ? brand.products.join(", ") : "N/A"}
Target audience: ${brand.targetAudience || "N/A"}
Website: ${brand.website || "N/A"}`,
      },
    ],
  });

  try {
    const parsed = parseLLMJson(completion.choices[0]?.message?.content, competitorListSchema);
    return parsed.competitors.map((c) => ({
      name: c.name,
      domain: c.domain ?? "",
      reason: c.reason,
      source: "ai" as const,
    }));
  } catch (err) {
    if (err instanceof LLMParseError) {
      logger.warn(
        { err: err.message, raw: err.raw.slice(0, 300), brandId: brand.id },
        "competitorDiscovery: AI inference JSON malformed",
      );
      return [];
    }
    throw err;
  }
}

async function mineCompetitorsFromCitations(brand: Brand): Promise<DiscoveredCompetitor[]> {
  const prompts = await storage.getBrandPromptsByBrandId(brand.id);
  if (prompts.length === 0) return [];
  const rankings = await storage.getGeoRankingsByBrandPromptIds(prompts.map((p) => p.id));
  const cited = rankings
    .filter((r) => r.isCited === 1 && r.citationContext)
    .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())
    .slice(0, MAX_CITATION_SCAN);
  if (cited.length === 0) return [];

  const responseBlob = cited
    .map((r) => {
      const idx = r.citationContext!.indexOf(RAW_DELIM);
      return idx >= 0 ? r.citationContext!.slice(idx + RAW_DELIM.length).slice(0, 2000) : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n")
    .slice(0, 15_000);

  if (!responseBlob) return [];

  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0.2,
    response_format: { type: "json_object" },
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content: `You are mining AI-generated responses to find real competitors of a given brand. Each response below was returned by ChatGPT/Claude/Gemini/Perplexity in answer to a user question, and mentioned the brand.

Your job: extract names of OTHER companies that appear alongside the brand in these responses. Filter out:
- generic category terms ("CRM software", "startup", "PR agency")
- the brand itself (see profile)
- obvious publications ("Forbes", "TechCrunch" — those are outlets, not competitors)
- acquired-by-brand or parent-of-brand relationships

Return JSON: {"competitors": [{"name": "Real Company Name", "domain": "example.com", "reason": "what they do"}]}. Max 10.`,
      },
      {
        role: "user",
        content: `Brand profile:
- Name: ${brand.name}
- Industry: ${brand.industry}
- Description: ${brand.description || "N/A"}

Responses (truncated):
${responseBlob}`,
      },
    ],
  });

  try {
    const parsed = parseLLMJson(completion.choices[0]?.message?.content, competitorListSchema);
    return parsed.competitors.map((c) => ({
      name: c.name,
      domain: c.domain ?? "",
      reason: c.reason,
      source: "citation_mining" as const,
    }));
  } catch (err) {
    if (err instanceof LLMParseError) {
      logger.warn(
        { err: err.message, raw: err.raw.slice(0, 300), brandId: brand.id },
        "competitorDiscovery: citation-mining JSON malformed",
      );
      return [];
    }
    throw err;
  }
}
