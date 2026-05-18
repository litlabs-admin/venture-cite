import OpenAI from "openai";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS, OPENROUTER_BASE_URL } from "./modelConfig";
import { safeFetchText } from "./ssrf";
import { matchEntity } from "./brandMatcher";
import { brandNameWarning } from "./brandNameAmbiguity";
import { type ScanReport, emptyReport } from "./scanReport";
import type { Brand, Listicle } from "@shared/schema";

import { logger } from "./logger";
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

import { safeParseJson } from "./safeParseJson";

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
export async function scanBrandListicles(brandId: string): Promise<ScanReport> {
  if (!openrouter) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("Brand not found");

  const report = emptyReport();
  const ambiguityWarning = brandNameWarning(brand.name);
  if (ambiguityWarning) report.warning = ambiguityWarning;

  // Wave 9.4: re-verification phase. For every existing listicle whose
  // last_verified_at is missing or older than 7 days, re-fetch the page
  // and re-run the matcher. Updates isIncluded / listPosition /
  // competitorsMentioned / lastVerifiedAt. Bounded at 50 to keep the
  // wall time reasonable.
  const REVERIFY_STALE_DAYS = 7;
  const REVERIFY_BATCH = 50;
  const trackedCompetitors = await storage.getCompetitors(brandId).catch(() => []);
  const existingRows = await storage.getListicles(brandId).catch(() => [] as Listicle[]);
  const cutoff = Date.now() - REVERIFY_STALE_DAYS * 24 * 60 * 60 * 1000;
  const stale = existingRows
    .filter((l) => !l.lastVerifiedAt || new Date(l.lastVerifiedAt as any).getTime() < cutoff)
    .slice(0, REVERIFY_BATCH);
  let reverified = 0;
  let lostInclusion = 0;
  for (const row of stale) {
    try {
      const { status, text } = await safeFetchText(row.url, {
        maxBytes: 5 * 1024 * 1024,
        timeoutMs: 15_000,
      });
      if (status < 200 || status >= 300) {
        await storage.updateListicle(row.id, { lastVerifiedAt: new Date() } as any);
        continue;
      }
      const pageText = htmlToText(text).slice(0, MAX_PAGE_CHARS);
      if (pageText.length < 300) {
        await storage.updateListicle(row.id, { lastVerifiedAt: new Date() } as any);
        continue;
      }
      const parsed = await parseListicle(pageText, brand).catch(() => null);
      const matcher = matchEntity(pageText, {
        id: brand.id,
        name: brand.name,
        nameVariations: Array.isArray(brand.nameVariations) ? brand.nameVariations : [],
        website: brand.website ?? null,
      });
      const newIncluded = matcher.matched ? 1 : 0;
      const newPos = matcher.matched ? (parsed?.brandPosition ?? null) : null;
      if (row.isIncluded === 1 && newIncluded === 0) lostInclusion += 1;
      await storage.updateListicle(row.id, {
        isIncluded: newIncluded,
        listPosition: newPos,
        lastVerifiedAt: new Date(),
      } as any);
      reverified += 1;
    } catch (err) {
      report.failed.push({
        url: row.url,
        reason: `re-verify failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  report.reverified = reverified;
  report.lostInclusion = lostInclusion;

  const queries = buildQueries(brand);
  if (queries.length === 0) return report;

  const candidateUrls = new Map<string, { query: string; title?: string }>();
  for (const q of queries) {
    try {
      const urls = await searchPerplexity(q);
      for (const u of urls) {
        const key = u.url.toLowerCase();
        if (!candidateUrls.has(key)) candidateUrls.set(key, { query: q, title: u.title });
      }
    } catch (err) {
      report.failed.push({
        reason: `perplexity "${q}" failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  report.found = candidateUrls.size;

  for (const [url, meta] of Array.from(candidateUrls.entries())) {
    let html = "";
    try {
      const { status, text } = await safeFetchText(url, {
        maxBytes: 5 * 1024 * 1024,
        timeoutMs: 15_000,
      });
      if (status < 200 || status >= 300) {
        report.failed.push({ url, reason: `fetch returned ${status}` });
        continue;
      }
      html = text;
    } catch (err) {
      report.failed.push({
        url,
        reason: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const pageText = htmlToText(html).slice(0, MAX_PAGE_CHARS);
    if (pageText.length < 300) {
      report.skippedFiltered += 1;
      continue;
    }

    const parsed = await parseListicle(pageText, brand).catch(() => null);
    if (!parsed || !parsed.isListicle) {
      report.skippedFiltered += 1;
      continue;
    }

    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();

    const matcherResult = matchEntity(pageText, {
      id: brand.id,
      name: brand.name,
      nameVariations: Array.isArray(brand.nameVariations) ? brand.nameVariations : [],
      website: brand.website ?? null,
    });
    const isIncluded = matcherResult.matched ? 1 : 0;
    const listPosition = matcherResult.matched ? (parsed.brandPosition ?? null) : null;

    const llmItemNames = Array.isArray(parsed.items)
      ? parsed.items.map((i: any) => String(i.name).slice(0, 120)).slice(0, 30)
      : [];
    const filteredCompetitorNames: string[] = [];
    for (const item of llmItemNames) {
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
      } else {
        filteredCompetitorNames.push(item);
      }
    }

    try {
      // Wave 9.4: ON CONFLICT DO NOTHING via the storage helper. Returns
      // null when the unique index (brand_id, lower(url)) collides — i.e.
      // the same URL was inserted between our pre-dedupe read and now,
      // which can happen on concurrent scans.
      const inserted = await storage.tryInsertListicle({
        brandId,
        title: String(parsed.title || meta.title || url).slice(0, 500),
        url,
        sourcePublication: host,
        listPosition,
        totalListItems: parsed.totalItems ?? null,
        isIncluded,
        competitorsMentioned: filteredCompetitorNames,
        keyword: meta.query,
        lastVerifiedAt: new Date(),
      } as any);
      if (inserted) report.inserted += 1;
      else report.skippedDuplicate += 1;
    } catch (err) {
      report.failed.push({
        url,
        reason: `insert failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  logger.info(
    `[listicleScanner] brand=${brandId} found=${report.found} inserted=${report.inserted} dup=${report.skippedDuplicate} filt=${report.skippedFiltered} failed=${report.failed.length} reverified=${reverified}`,
  );
  return report;
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
