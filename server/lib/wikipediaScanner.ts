import OpenAI from "openai";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { logger } from "./logger";
import { safeFetchText } from "./ssrf";
import { matchEntity } from "./brandMatcher";
import type { Brand, WikipediaMention, Competitor } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const MAX_SEARCH_TERMS = 8;
const MAX_PAGES_TO_CLASSIFY = 25;
const EXTRACT_CHAR_CAP = 1200;

interface WikiSearchHit {
  title: string;
}

interface WikiPageEntry {
  title: string;
  extract: string;
}

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

function buildSearchTerms(brand: Brand, competitors: Competitor[]): string[] {
  const terms: string[] = [];
  if (brand.name) terms.push(brand.name);
  if (brand.industry) terms.push(brand.industry);
  const products = Array.isArray(brand.products) ? brand.products.slice(0, 3) : [];
  for (const p of products) {
    if (typeof p === "string" && p.trim()) terms.push(p.trim());
  }
  for (const c of competitors) {
    if (c?.name) terms.push(c.name);
  }
  // Dedup case-insensitively
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_SEARCH_TERMS) break;
  }
  return out;
}

async function searchWikipedia(term: string): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    term,
  )}&format=json&srlimit=10`;
  try {
    const { status, text } = await safeFetchText(url, {
      timeoutMs: 10_000,
      maxBytes: 500_000,
    });
    if (status < 200 || status >= 300) return [];
    const body = JSON.parse(text) as { query?: { search?: WikiSearchHit[] } };
    const hits = body.query?.search ?? [];
    return hits.map((h) => h.title).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchExtract(title: string): Promise<string> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(
    title,
  )}&format=json`;
  try {
    const { status, text } = await safeFetchText(url, {
      timeoutMs: 10_000,
      maxBytes: 500_000,
    });
    if (status < 200 || status >= 300) return "";
    const body = JSON.parse(text) as { query?: { pages?: Record<string, { extract?: string }> } };
    const pages = body.query?.pages ?? {};
    const first = Object.values(pages)[0];
    return first?.extract?.slice(0, EXTRACT_CHAR_CAP) ?? "";
  } catch {
    return "";
  }
}

async function classifyPages(
  brand: Brand,
  competitors: Competitor[],
  pages: WikiPageEntry[],
): Promise<
  Array<{
    title: string;
    classification: "existing" | "opportunity" | "irrelevant";
    reason: string;
  }>
> {
  if (pages.length === 0) return [];
  const competitorNames = competitors.map((c) => c.name).filter(Boolean);
  const productList = Array.isArray(brand.products) ? brand.products.join(", ") : "";

  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You classify Wikipedia pages for GEO / Wikipedia-outreach strategy.

For each page you are given (real page titles + leading extracts from the live Wikipedia API), pick exactly one classification:
- "existing": the brand name, website, or a tracked competitor appears explicitly in the extract text
- "opportunity": the page is topically relevant to the brand's industry/products and the brand could legitimately be cited there, but the brand is not yet named in the extract
- "irrelevant": the page is tangential or unrelated — drop it

Return JSON: {"pages": [{"title": string, "classification": "existing"|"opportunity"|"irrelevant", "reason": string (<=140 chars)}]}
Titles in the output MUST exactly match the input titles.`,
      },
      {
        role: "user",
        content: `Brand: ${brand.name}
Website: ${brand.website || "n/a"}
Industry: ${brand.industry || "n/a"}
Products: ${productList || "n/a"}
Tracked competitors: ${competitorNames.join(", ") || "none"}

Pages to classify:
${pages
  .map(
    (p, i) => `${i + 1}. ${p.title}\n   Extract: ${p.extract.replace(/\s+/g, " ").slice(0, 600)}`,
  )
  .join("\n\n")}`,
      },
    ],
  });

  const parsed = safeParseJson<{
    pages?: Array<{ title?: string; classification?: string; reason?: string }>;
  }>(completion.choices[0]?.message?.content);

  const out: Array<{
    title: string;
    classification: "existing" | "opportunity" | "irrelevant";
    reason: string;
  }> = [];
  if (!parsed?.pages) return out;
  for (const row of parsed.pages) {
    if (!row?.title || typeof row.title !== "string") continue;
    const c =
      row.classification === "existing" || row.classification === "opportunity"
        ? row.classification
        : "irrelevant";
    out.push({
      title: row.title,
      classification: c,
      reason: (row.reason ?? "").slice(0, 200),
    });
  }
  return out;
}

/**
 * Two-step Wikipedia scan. Real MediaWiki search finds pages (no hallucination),
 * then an LLM classifies each page as existing-mention / opportunity / irrelevant.
 * Only non-irrelevant pages are persisted to wikipedia_mentions.
 */
export async function scanBrandWikipedia(
  brandId: string,
): Promise<{ inserted: number; existing: number; opportunities: number }> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("Brand not found");

  const competitors = await storage.getCompetitors(brandId).catch(() => [] as Competitor[]);
  const terms = buildSearchTerms(brand, competitors);

  // (a) collect candidate titles
  const titleSet = new Set<string>();
  for (const term of terms) {
    const titles = await searchWikipedia(term);
    for (const t of titles) titleSet.add(t);
    if (titleSet.size >= MAX_PAGES_TO_CLASSIFY * 2) break;
  }

  // (b) fetch extracts (cap for token budget)
  const titles = Array.from(titleSet).slice(0, MAX_PAGES_TO_CLASSIFY);
  const pages: WikiPageEntry[] = [];
  for (const title of titles) {
    const extract = await fetchExtract(title);
    if (!extract) continue;
    pages.push({ title, extract });
  }

  // (c) classify
  const classified = await classifyPages(brand, competitors, pages).catch(() => []);

  // (d) dedupe against existing rows by pageUrl
  const existingRows = await storage
    .getWikipediaMentions(brandId)
    .catch(() => [] as WikipediaMention[]);
  const existingUrls = new Set((existingRows as WikipediaMention[]).map((m) => m.pageUrl));

  let inserted = 0;
  let existingCount = 0;
  let opportunityCount = 0;
  const pageByTitle = new Map(pages.map((p) => [p.title, p]));

  for (const row of classified) {
    if (row.classification === "irrelevant") continue;
    const page = pageByTitle.get(row.title);
    if (!page) continue;
    const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, "_"))}`;

    // Matcher is authoritative for "is the brand named in this extract".
    // LLM-only signal ("existing" vs "opportunity") can hallucinate a
    // mention that isn't there, or miss one that's paraphrased. Combined
    // rule: LLM decides topical relevance (we already filtered "irrelevant"
    // above), matcher decides existing/opportunity.
    const matcherResult = matchEntity(page.extract, {
      id: brand.id,
      name: brand.name,
      nameVariations: Array.isArray(brand.nameVariations) ? brand.nameVariations : [],
      website: brand.website ?? null,
    });
    const classification: "existing" | "opportunity" = matcherResult.matched
      ? "existing"
      : "opportunity";
    if (classification === "existing") existingCount += 1;
    else opportunityCount += 1;
    if (existingUrls.has(pageUrl)) continue;
    try {
      await storage.createWikipediaMention({
        brandId,
        pageTitle: row.title.slice(0, 500),
        pageUrl: pageUrl.slice(0, 1000),
        mentionContext: page.extract.slice(0, 400),
        mentionType: classification,
        sectionName: null,
        isActive: 1,
        metadata: {
          reason: row.reason,
          source: "wikipedia_scan",
          scannedAt: new Date().toISOString(),
        },
      } as any);
      existingUrls.add(pageUrl);
      inserted += 1;
    } catch (err) {
      logger.warn({ err, pageUrl, brandId }, "wikipediaScanner insert failed");
    }
  }

  logger.info(
    {
      brandId,
      classified: classified.length,
      inserted,
      existing: existingCount,
      opportunities: opportunityCount,
    },
    "wikipediaScanner complete",
  );
  return { inserted, existing: existingCount, opportunities: opportunityCount };
}
