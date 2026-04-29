import OpenAI from "openai";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS, OPENROUTER_BASE_URL } from "./modelConfig";
import { safeFetchText } from "./ssrf";
import { matchEntity } from "./brandMatcher";
import type { Brand, Listicle } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const openrouter = process.env.OPENROUTER_API_KEY
  ? (() => {
      const c = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: OPENROUTER_BASE_URL,
        timeout: 60_000,
        maxRetries: 1,
      });
      attachAiLogger(c);
      return c;
    })()
  : null;

const MAX_PAGE_CHARS = 12_000;
const MAX_URLS_PER_QUERY = 8;
const MAX_QUERIES = 5;

function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQueries(brand: Brand): string[] {
  const q: string[] = [];
  const industry = brand.industry || "";
  const product =
    Array.isArray(brand.products) && brand.products.length > 0 ? brand.products[0] : industry;
  const year = new Date().getFullYear();
  if (industry) q.push(`best ${industry} tools`);
  if (industry) q.push(`top ${industry} companies ${year}`);
  if (industry) q.push(`${industry} alternatives`);
  if (brand.name) q.push(`${brand.name} competitors`);
  if (product && brand.targetAudience) q.push(`best ${product} for ${brand.targetAudience}`);
  return q.filter(Boolean).slice(0, MAX_QUERIES);
}

interface PerplexityUrl {
  url: string;
  title?: string;
  snippet?: string;
}

/**
 * Weekly cron. Use Perplexity's web-search model to find currently-published
 * listicles for each brand-profile-derived query, fetch each URL, parse the
 * list structure with OpenAI, and write rows into `listicles`.
 *
 * Rows where the brand isn't in the list are still stored (isIncluded=0) as
 * outreach targets.
 */
export async function scanBrandListicles(
  brandId: string,
): Promise<{ inserted: number; candidates: number; reason: "ok" | "no_candidates" }> {
  if (!openrouter) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("Brand not found");

  const existing = await storage.getListicles(brandId).catch(() => [] as Listicle[]);
  const existingUrls = new Set(existing.map((l: Listicle) => l.url.toLowerCase()));

  // Wave 8: load tracked competitors once so we can matcher-confirm the
  // LLM's competitorsMentioned[] per page. Drops phantom competitors
  // the LLM hallucinated as being on the page.
  const trackedCompetitors = await storage.getCompetitors(brandId).catch(() => []);

  const queries = buildQueries(brand);
  if (queries.length === 0) return { inserted: 0, candidates: 0, reason: "no_candidates" };

  const candidateUrls = new Map<string, { query: string; title?: string }>();
  for (const q of queries) {
    try {
      const urls = await searchPerplexity(q);
      for (const u of urls) {
        const key = u.url.toLowerCase();
        if (!candidateUrls.has(key)) candidateUrls.set(key, { query: q, title: u.title });
      }
    } catch (err) {
      console.warn(
        `[listicleScanner] perplexity "${q}" failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  let inserted = 0;
  for (const [url, meta] of Array.from(candidateUrls.entries())) {
    if (existingUrls.has(url)) continue;

    let html = "";
    try {
      const { status, text } = await safeFetchText(url, {
        maxBytes: 5 * 1024 * 1024,
        timeoutMs: 15_000,
      });
      if (status < 200 || status >= 300) continue;
      html = text;
    } catch {
      continue;
    }

    const pageText = htmlToText(html).slice(0, MAX_PAGE_CHARS);
    if (pageText.length < 300) continue;

    const parsed = await parseListicle(pageText, brand).catch(() => null);
    if (!parsed || !parsed.isListicle) continue;

    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();

    // Wave 8: matcher is the sole authority for isIncluded. Previously we
    // OR'd matcher result with the LLM's mentionsBrand boolean — but that
    // let LLM hallucinations through. The variant list now resolves the
    // LLM's job (catching alternative spellings) without trusting its
    // verdict.
    const matcherResult = matchEntity(pageText, {
      id: brand.id,
      name: brand.name,
      nameVariations: Array.isArray(brand.nameVariations) ? brand.nameVariations : [],
      website: brand.website ?? null,
    });
    const isIncluded = matcherResult.matched ? 1 : 0;
    // Force position to null when the matcher says the brand isn't on
    // the page, regardless of what the LLM claimed about brandPosition.
    const listPosition = matcherResult.matched ? (parsed.brandPosition ?? null) : null;

    // Filter the LLM's competitorsMentioned[] through a matcher pass per
    // tracked competitor. Drops names the LLM claims are on the page but
    // the matcher can't verify in pageText. Untracked names (not in our
    // competitor table) pass through unchanged — matcher can't validate
    // what it doesn't know about, and these are useful for outreach.
    const trackedCompIds = new Set(trackedCompetitors.map((c) => c.id));
    const llmItemNames = Array.isArray(parsed.items)
      ? parsed.items.map((i: any) => String(i.name).slice(0, 120)).slice(0, 30)
      : [];
    const filteredCompetitorNames: string[] = [];
    for (const item of llmItemNames) {
      // Try to map this LLM-extracted name to a tracked competitor by
      // case-insensitive name match. If we have a tracked match, run the
      // matcher with that competitor's full variation list.
      const trackedMatch = trackedCompetitors.find(
        (c) => c.name.toLowerCase() === item.toLowerCase(),
      );
      if (trackedMatch) {
        const compMatch = matchEntity(pageText, {
          id: trackedMatch.id,
          name: trackedMatch.name,
          nameVariations: Array.isArray((trackedMatch as any).nameVariations)
            ? ((trackedMatch as any).nameVariations as string[])
            : [],
          website: trackedMatch.domain ?? null,
        });
        if (compMatch.matched) filteredCompetitorNames.push(item);
        // else: LLM claimed this competitor was on the page but matcher
        // couldn't find them — drop. Don't log per-name (would spam on
        // every weekly cron).
      } else {
        // Not in our competitor table. Keep — useful for outreach UI.
        filteredCompetitorNames.push(item);
      }
    }
    void trackedCompIds; // reserved for future stricter filters

    try {
      await storage.createListicle({
        brandId,
        title: String(parsed.title || meta.title || url).slice(0, 500),
        url,
        sourcePublication: host,
        listPosition,
        totalListItems: parsed.totalItems ?? null,
        isIncluded,
        competitorsMentioned: filteredCompetitorNames,
        keyword: meta.query,
        lastChecked: new Date(),
      } as any);
      inserted += 1;
    } catch (err) {
      console.warn(
        `[listicleScanner] insert failed for ${url}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[listicleScanner] brand=${brandId} candidates=${candidateUrls.size} inserted=${inserted}`,
  );
  return {
    inserted,
    candidates: candidateUrls.size,
    reason: candidateUrls.size === 0 ? "no_candidates" : "ok",
  };
}

async function searchPerplexity(query: string): Promise<PerplexityUrl[]> {
  if (!openrouter) return [];
  const completion = await openrouter.chat.completions.create({
    model: MODELS.citationPerplexity,
    temperature: 0,
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are a web search assistant. Given a search query, return up to ${MAX_URLS_PER_QUERY} real URLs of currently-published listicles or "best of" articles that would appear on Google's first page for this query. Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): {"urls": [{"url": "https://...", "title": "...", "snippet": "..."}]}. Only real URLs you can verify exist right now.`,
      },
      { role: "user", content: query },
    ],
  });
  const parsed = safeParseJson<{ urls?: PerplexityUrl[] }>(completion.choices[0]?.message?.content);
  if (!parsed || !Array.isArray(parsed.urls)) return [];
  return parsed.urls
    .filter((u) => u && typeof u.url === "string" && /^https?:\/\//.test(u.url))
    .slice(0, MAX_URLS_PER_QUERY);
}

async function parseListicle(
  pageText: string,
  brand: Brand,
): Promise<{
  isListicle: boolean;
  title?: string;
  items?: Array<{ position: number; name: string; domain?: string }>;
  totalItems?: number;
  mentionsBrand?: boolean;
  brandPosition?: number | null;
}> {
  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are analyzing a web page to determine if it's a listicle/"best of" article. If yes, extract the list. Return JSON:
{"isListicle": boolean, "title": string, "items": [{"position": number, "name": string, "domain": string}], "totalItems": number, "mentionsBrand": boolean, "brandPosition": number|null}

- isListicle true only if the page is ranked/ordered content listing multiple companies/products/tools
- items is the actual list in order
- mentionsBrand: does the specified brand appear in the list?
- brandPosition: 1-indexed position, null if not in list

If not a listicle, return {"isListicle": false}.`,
      },
      {
        role: "user",
        content: `Brand to check: ${brand.name} (${brand.website || "no website"})

Page content:
${pageText}`,
      },
    ],
  });
  const parsed = safeParseJson<any>(completion.choices[0]?.message?.content);
  return parsed || { isListicle: false };
}
