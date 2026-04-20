import OpenAI from "openai";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import type { Brand } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const RAW_DELIM = "||| RAW_RESPONSE |||";
const MAX_CITATION_SCAN = 50; // how many recent cited responses to mine

function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try { return JSON.parse(candidate) as T; } catch { return null; }
}

interface DiscoveredCompetitor {
  name: string;
  domain: string;
  reason?: string;
  source: "ai" | "citation_mining";
}

/**
 * Discover competitors for a brand from two sources:
 *   1. OpenAI inference from the brand profile (cheap baseline)
 *   2. Citation-context mining — extract brand names that AI engines mention
 *      alongside the user's brand in real citation results, then have an LLM
 *      judge filter out generic terms
 *
 * Dedupes against existing `competitors` rows (case-insensitive name + domain).
 * Returns the count of rows actually inserted. Idempotent — safe to re-run.
 */
export async function discoverCompetitors(brandId: string): Promise<number> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("Brand not found");

  const existing = await storage.getCompetitors(brandId);
  const existingLowerNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const existingDomains = new Set(
    existing
      .map((c) => (c.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0])
      .filter(Boolean),
  );

  const candidates: DiscoveredCompetitor[] = [];

  // Source 1 — AI inference from brand profile.
  try {
    const aiCompetitors = await inferCompetitorsFromProfile(brand);
    candidates.push(...aiCompetitors.map((c) => ({ ...c, source: "ai" as const })));
  } catch (err) {
    console.warn(`[competitorDiscovery] AI inference failed:`, err instanceof Error ? err.message : err);
  }

  // Source 2 — citation context mining.
  try {
    const mined = await mineCompetitorsFromCitations(brand);
    candidates.push(...mined.map((c) => ({ ...c, source: "citation_mining" as const })));
  } catch (err) {
    console.warn(`[competitorDiscovery] citation mining failed:`, err instanceof Error ? err.message : err);
  }

  let inserted = 0;
  const seenInBatch = new Set<string>();
  for (const cand of candidates) {
    const nameKey = cand.name.toLowerCase().trim();
    const domainKey = (cand.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (!nameKey || nameKey.length < 2) continue;
    if (existingLowerNames.has(nameKey) || (domainKey && existingDomains.has(domainKey))) continue;
    if (seenInBatch.has(nameKey)) continue;
    seenInBatch.add(nameKey);

    try {
      await storage.createCompetitor({
        brandId,
        name: cand.name.slice(0, 120),
        domain: domainKey || cand.domain || "",
        industry: brand.industry || null,
        description: cand.reason ? `[auto-discovered] ${cand.reason}`.slice(0, 500) : "[auto-discovered]",
        discoveredBy: cand.source,
      } as any);
      inserted += 1;
    } catch (err) {
      console.warn(`[competitorDiscovery] insert failed for "${cand.name}":`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[competitorDiscovery] brand=${brandId} candidates=${candidates.length} inserted=${inserted}`);
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

  const parsed = safeParseJson<{ competitors?: DiscoveredCompetitor[] }>(completion.choices[0]?.message?.content);
  if (!parsed || !Array.isArray(parsed.competitors)) return [];
  return parsed.competitors
    .filter((c) => c && typeof c.name === "string" && typeof c.domain === "string")
    .slice(0, 10);
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

  const parsed = safeParseJson<{ competitors?: DiscoveredCompetitor[] }>(completion.choices[0]?.message?.content);
  if (!parsed || !Array.isArray(parsed.competitors)) return [];
  return parsed.competitors
    .filter((c) => c && typeof c.name === "string")
    .map((c) => ({ name: c.name, domain: c.domain || "", reason: c.reason, source: "citation_mining" as const }))
    .slice(0, 10);
}
