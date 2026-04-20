import OpenAI from "openai";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { safeFetchText } from "./ssrf";
import type { Brand, BrandFactSheet } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

// Common subpages where brand facts live. Scanned in order; failures are skipped silently.
const FACT_PAGE_PATHS = [
  "/about",
  "/about-us",
  "/team",
  "/company",
  "/pricing",
  "/press",
  "/newsroom",
  "/faq",
  "/faqs",
];

const MAX_PAGE_CHARS = 8_000;
const ALLOWED_CATEGORIES = new Set([
  "founding", "funding", "team", "products", "pricing", "locations", "achievements", "other",
]);

function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try { return JSON.parse(candidate) as T; } catch { return null; }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBaseUrl(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return `${url.protocol}//${url.host}`;
  } catch { return null; }
}

interface ExtractedFact {
  factCategory: string;
  factKey: string;
  factValue: string;
  confidence?: number;
}

/**
 * Full auto-scrape pipeline. Run async after a brand is created; don't block
 * the create response. Idempotent — dedupes against existing (brandId,
 * factCategory, factKey) rows so re-running just refreshes.
 */
export async function scrapeBrandFacts(brandId: string): Promise<number> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("Brand not found");
  if (!brand.website) {
    console.log(`[factExtractor] brand ${brandId} has no website — skipping`);
    return 0;
  }

  const base = normalizeBaseUrl(brand.website);
  if (!base) return 0;

  const existing = await storage.getBrandFacts(brandId);
  const existingKeys = new Set(
    existing.map((f: BrandFactSheet) => `${f.factCategory.toLowerCase()}::${f.factKey.toLowerCase()}`),
  );

  let inserted = 0;

  for (const path of FACT_PAGE_PATHS) {
    const url = `${base}${path}`;
    let pageText = "";
    try {
      const { status, text } = await safeFetchText(url, { maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000 });
      if (status < 200 || status >= 300) continue;
      pageText = htmlToText(text).slice(0, MAX_PAGE_CHARS);
      if (pageText.length < 200) continue; // page too empty to be useful
    } catch {
      // SSRF block, network failure, etc. Skip page.
      continue;
    }

    const facts = await extractFactsFromText(pageText, brand, path).catch((err) => {
      console.warn(`[factExtractor] extraction failed for ${url}:`, err instanceof Error ? err.message : err);
      return [] as ExtractedFact[];
    });

    for (const f of facts) {
      const cat = (f.factCategory || "other").toLowerCase().trim();
      const key = (f.factKey || "").toLowerCase().trim().replace(/\s+/g, "_");
      if (!key || !f.factValue || !ALLOWED_CATEGORIES.has(cat)) continue;
      const dedupeKey = `${cat}::${key}`;
      if (existingKeys.has(dedupeKey)) continue;
      existingKeys.add(dedupeKey);

      try {
        await storage.createBrandFact({
          brandId,
          factCategory: cat,
          factKey: key,
          factValue: String(f.factValue).slice(0, 1000),
          sourceUrl: url,
          source: "scraped",
          isActive: 1,
        } as any);
        inserted += 1;
      } catch (err) {
        console.warn(`[factExtractor] insert failed for ${cat}/${key}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`[factExtractor] brand=${brandId} inserted=${inserted} facts`);
  return inserted;
}

async function extractFactsFromText(
  pageText: string,
  brand: Brand,
  pagePath: string,
): Promise<ExtractedFact[]> {
  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0.2,
    response_format: { type: "json_object" },
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content: `You extract structured facts about a company from a single web page. Return JSON: {"facts": [{"factCategory": string, "factKey": string, "factValue": string, "confidence": 0-100}]}.

Rules:
- factCategory must be one of: founding, funding, team, products, pricing, locations, achievements, other
- factKey is lowercase_snake_case (e.g. "year_founded", "series_b_amount", "ceo_name", "hq_city")
- factValue is a short plain string (e.g. "2018", "$25M", "Jane Doe", "San Francisco")
- One fact per row — don't bundle multiple pieces into one value
- Only extract facts you're confident about. Return empty array if none.`,
      },
      {
        role: "user",
        content: `Brand: ${brand.name} (${brand.industry})
Page path: ${pagePath}

Page content:
${pageText}`,
      },
    ],
  });

  const parsed = safeParseJson<{ facts?: ExtractedFact[] }>(completion.choices[0]?.message?.content);
  if (!parsed || !Array.isArray(parsed.facts)) return [];
  return parsed.facts.filter((f) => f && typeof f.factKey === "string" && typeof f.factValue === "string");
}

/**
 * Monthly refresh. For every scraped fact with a sourceUrl, re-fetch the page,
 * re-extract, compare. Updates factValue if changed; stamps lastVerified either way.
 */
export async function refreshScrapedFacts(brandId: string): Promise<{ updated: number; checked: number }> {
  const facts = await storage.getBrandFacts(brandId);
  const scraped = facts.filter((f: any) => f.source === "scraped" && f.sourceUrl);
  let updated = 0;

  // Group by sourceUrl so we fetch each page once
  const byUrl = new Map<string, BrandFactSheet[]>();
  for (const f of scraped as BrandFactSheet[]) {
    const arr = byUrl.get(f.sourceUrl!) || [];
    arr.push(f);
    byUrl.set(f.sourceUrl!, arr);
  }

  const brand = await storage.getBrandById(brandId);
  if (!brand) return { updated: 0, checked: scraped.length };

  for (const [url, group] of Array.from(byUrl.entries())) {
    let pageText = "";
    try {
      const { status, text } = await safeFetchText(url, { maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000 });
      if (status < 200 || status >= 300) continue;
      pageText = htmlToText(text).slice(0, MAX_PAGE_CHARS);
    } catch { continue; }

    const fresh = await extractFactsFromText(pageText, brand, new URL(url).pathname).catch(() => [] as ExtractedFact[]);
    const freshMap = new Map(fresh.map((f) => [`${(f.factCategory || "").toLowerCase()}::${(f.factKey || "").toLowerCase()}`, f.factValue]));

    for (const existing of group) {
      const key = `${existing.factCategory.toLowerCase()}::${existing.factKey.toLowerCase()}`;
      const newValue = freshMap.get(key);
      if (newValue && newValue !== existing.factValue) {
        try {
          await storage.updateBrandFact(existing.id, { factValue: String(newValue).slice(0, 1000), lastVerified: new Date() } as any);
          updated += 1;
        } catch (err) {
          console.warn(`[factExtractor] refresh update failed:`, err instanceof Error ? err.message : err);
        }
      } else {
        try {
          await storage.updateBrandFact(existing.id, { lastVerified: new Date() } as any);
        } catch { /* ignore */ }
      }
    }
  }

  return { updated, checked: scraped.length };
}
