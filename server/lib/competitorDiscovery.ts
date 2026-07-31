import OpenAI from "openai";
import { z } from "zod";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { parseLLMJson, LLMParseError } from "./llmParse";
import { logger } from "./logger";
import { LLM_CALL_TIMEOUT_MS } from "./factAgent/v2/vercelBudget";
import { relevanceForRank } from "./competitorRelevance";
import type { Brand } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Inherit Vercel-tier budget so this never outlives the function.
  timeout: LLM_CALL_TIMEOUT_MS,
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
  // 0-100, assigned by rank within its source (most-direct first). Profile
  // inference scores in the core band (60-100); citation mining, being
  // noisier "appeared alongside" signal, scores in the discovered band (25-55).
  relevanceScore: number;
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

// Compact the brand fact sheet into a bullet digest the discovery model can
// read alongside the profile. Capped so it can't blow the prompt budget on a
// brand with a large sheet; one short line per fact, highest-signal first.
function buildFactDigest(
  facts: { subcategory?: string | null; factKey?: string | null; factValue?: string | null }[],
): string {
  if (!facts || facts.length === 0) return "";
  const lines: string[] = [];
  let len = 0;
  for (const f of facts) {
    const val = (f.factValue ?? "").trim();
    if (!val) continue;
    const label = [f.subcategory, f.factKey].filter(Boolean).join(" · ");
    const line = `- ${label ? `${label}: ` : ""}${val}`.slice(0, 240);
    if (len + line.length > 1800) break;
    lines.push(line);
    len += line.length + 1;
  }
  return lines.join("\n");
}

/**
 * Discover competitors for a brand from two sources:
 *   1. OpenAI inference from the brand profile (cheap baseline)
 *   2. Citation-context mining - extract brand names that AI engines mention
 *      alongside the user's brand in real citation results
 *
 * Dedup is handled at the DB level via the unique index on
 * (brand_id, lower(name), lower(coalesce(domain,''))) - createCompetitor
 * upserts, so there's no race window between parallel callers. Ignored /
 * soft-deleted rows stay tombstoned (lastSeenAt bumps, no revive).
 *
 * Returns the number of rows touched (inserts + revives + last_seen bumps).
 */
export async function discoverCompetitors(brandId: string): Promise<number> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) {
    logger.warn({ brandId }, "competitorDiscovery: brand not found - skipping");
    return 0;
  }
  if ((brand as any).deletedAt) {
    logger.info({ brandId }, "competitorDiscovery: brand is soft-deleted - skipping");
    return 0;
  }
  if (!process.env.OPENAI_API_KEY) {
    logger.warn({ brandId }, "competitorDiscovery: OPENAI_API_KEY missing - skipping");
    return 0;
  }

  // Only used to skip LLM calls that'd just produce ignored rows. DB
  // uniqueness still enforces correctness regardless.
  const existing = await storage.getCompetitors(brandId, { includeDeleted: true });
  const ignoredNameKeys = new Set(
    existing.filter((c) => (c as any).isIgnored === 1).map((c) => c.name.toLowerCase().trim()),
  );

  // Brand fact sheet sharpens substitutability judgement: a verified
  // positioning / product / audience fact lets the model reject lookalikes
  // that share a category but not a buyer. Best-effort - discovery still
  // runs on the profile alone if the sheet is empty or unavailable.
  let factDigest = "";
  try {
    factDigest = buildFactDigest(await storage.getBrandFacts(brandId));
  } catch (err) {
    logger.warn(
      { err, brandId },
      "competitorDiscovery: fact-sheet load failed - using profile only",
    );
  }

  const candidates: DiscoveredCompetitor[] = [];

  try {
    const aiCompetitors = await inferCompetitorsFromProfile(brand, factDigest);
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
        // AI-inferred direct competitors seed the curated core set; mined
        // "appeared alongside" names land in the broader discovered pool.
        tier: cand.source === "ai" ? "core" : "discovered",
        relevanceScore: cand.relevanceScore,
      } as any);
      touched += 1;
    } catch (err) {
      logger.warn({ err, brandId, name: cand.name }, "competitorDiscovery: upsert failed");
    }
  }

  logger.info({ brandId, candidates: candidates.length, touched }, "competitorDiscovery: done");
  return touched;
}

async function inferCompetitorsFromProfile(
  brand: Brand,
  factDigest: string,
): Promise<DiscoveredCompetitor[]> {
  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0.2,
    response_format: { type: "json_object" },
    max_tokens: 1400,
    messages: [
      {
        role: "system",
        content: `You are a competitive-intelligence analyst. Given a brand profile, return up to 10 real, DIRECT competitors: companies a prospective buyer would seriously evaluate INSTEAD of this brand because they sell a substitutable product to the same audience.

Hard requirements:
- Only real, currently-operating companies (no fictional, no shut-down, no companies already acquired into another brand).
- Direct substitutes only: a company qualifies only if a buyer could realistically choose it instead of this brand to solve the same job.

Exclude these common false positives:
- Tools, platforms, infrastructure, or vendors the brand merely USES or integrates with.
- Publications, news outlets, blogs, directories, marketplaces, and review sites.
- Generic category terms ("CRM software", "a PR agency") instead of named companies.
- Parent companies, subsidiaries, or resellers of the brand.
- Agencies or consultancies, UNLESS this brand is itself an agency or consultancy.

Order the list most-direct first (strongest substitute at the top). Aim for 8-10 when the market supports it; return fewer rather than padding with weak or tangential matches. For each, give: name, primary domain (bare host, no protocol or path), and a one-line reason naming the overlapping product or audience.

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
Website: ${brand.website || "N/A"}${
          factDigest
            ? `\n\nVerified brand facts (use these to judge who is a true substitute, not just a category neighbour):\n${factDigest}`
            : ""
        }`,
      },
    ],
  });

  try {
    const parsed = parseLLMJson(completion.choices[0]?.message?.content, competitorListSchema);
    // List is returned most-direct-first; score by position in the core band.
    return parsed.competitors.map((c, i) => ({
      name: c.name,
      domain: c.domain ?? "",
      reason: c.reason,
      source: "ai" as const,
      relevanceScore: relevanceForRank("ai", i),
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

Your job: extract names of OTHER companies that are DIRECT competitors (a buyer could pick them instead of the brand) appearing alongside the brand in these responses. Filter out:
- generic category terms ("CRM software", "startup", "PR agency")
- the brand itself (see profile)
- publications and outlets ("Forbes", "TechCrunch"), directories, and marketplaces
- tools, platforms, or vendors the brand merely uses or integrates with
- acquired-by-brand, parent-of-brand, or subsidiary relationships

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
    return parsed.competitors.map((c, i) => ({
      name: c.name,
      domain: c.domain ?? "",
      reason: c.reason,
      source: "citation_mining" as const,
      relevanceScore: relevanceForRank("citation_mining", i),
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
