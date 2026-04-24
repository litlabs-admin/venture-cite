import OpenAI from "openai";
import { z } from "zod";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { safeFetchText } from "./ssrf";
import { parseLLMJson, LLMParseError } from "./llmParse";
import { logger } from "./logger";
import type { Brand, BrandFactSheet } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

// Common subpages where brand facts live. Scanned in order; failures are
// skipped silently. The root page "/" is included first so SPAs (which
// typically return the same shell for every subpath) still contribute —
// we extract what we can from the landing copy rather than bail to 0.
const FACT_PAGE_PATHS = [
  "/",
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
  "founding",
  "funding",
  "team",
  "products",
  "pricing",
  "locations",
  "achievements",
  "other",
]);

const factsResponseSchema = z.object({
  facts: z
    .array(
      z.object({
        factCategory: z.string(),
        factKey: z.string(),
        factValue: z.union([z.string(), z.number(), z.boolean()]).transform(String),
        confidence: z.number().optional(),
      }),
    )
    .max(40),
});

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

// Favicon-only logo resolution. Walks every <link rel=...icon...> tag in
// document order (covers rel="icon", rel="shortcut icon", rel="apple-touch-
// icon", rel="apple-touch-icon-precomposed"). Falls back to /favicon.ico with
// an existence probe. Returns a fully-qualified URL or null — no third-party
// fallback; null is a real signal.
export async function scrapeLogoUrl(homepageUrl: string, html: string): Promise<string | null> {
  const trace: Record<string, unknown> = { homepageUrl };

  const resolveHref = (href: string): string | null => {
    if (!href || href.startsWith("data:") || href.startsWith("#")) return null;
    try {
      return new URL(href, homepageUrl).toString();
    } catch {
      return null;
    }
  };

  // Confirms a scraped icon URL actually returns an image. Sites often list
  // <link rel=icon href=/old-name.png> that 404s, so we verify before handing
  // it to the client — otherwise the browser <img> fails silently and the
  // user sees no logo at all.
  const verifyIsImage = async (url: string): Promise<boolean> => {
    try {
      const { status, contentType } = await safeFetchText(url, {
        maxBytes: 256 * 1024,
        timeoutMs: 5_000,
      });
      if (status < 200 || status >= 300) return false;
      return contentType.startsWith("image/") || contentType.includes("icon") || contentType === "";
    } catch {
      return false;
    }
  };

  // 1) <link rel=...icon...> — collect all candidates, prefer apple-touch-icon
  //    (usually 180×180 PNG, the nicest logo we can get without fetching).
  const iconCandidates: { url: string; rel: string }[] = [];
  const linkRe = /<link\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const relMatch = attrs.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
    if (!relMatch) continue;
    const rel = (relMatch[1] || relMatch[2] || relMatch[3] || "").toLowerCase();
    if (!rel.includes("icon")) continue;
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1] || hrefMatch[2] || hrefMatch[3];
    const url = resolveHref(href);
    if (url) iconCandidates.push({ url, rel });
  }
  // Try candidates in priority order, verifying each actually loads.
  const ordered = [
    ...iconCandidates.filter((c) => c.rel.includes("apple-touch-icon")),
    ...iconCandidates.filter((c) => c.rel === "icon"),
    ...iconCandidates.filter((c) => !c.rel.includes("apple-touch-icon") && c.rel !== "icon"),
  ];
  const triedLinkTags: { url: string; rel: string; ok: boolean }[] = [];
  for (const candidate of ordered) {
    const ok = await verifyIsImage(candidate.url);
    triedLinkTags.push({ url: candidate.url, rel: candidate.rel, ok });
    if (ok) {
      trace.source = "link-tag";
      trace.rel = candidate.rel;
      trace.result = candidate.url;
      logger.info(trace, "scrapeLogoUrl trace");
      return candidate.url;
    }
  }
  if (triedLinkTags.length > 0) {
    trace.linkTagsTried = triedLinkTags;
  }

  // 2) <link rel="manifest"> — web app manifest lists icons in JSON.
  const manifestMatch = html.match(/<link\b[^>]*\brel\s*=\s*["']?manifest["']?[^>]*>/i);
  if (manifestMatch) {
    const hrefMatch = manifestMatch[0].match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i);
    const manifestUrl = hrefMatch
      ? resolveHref(hrefMatch[1] || hrefMatch[2] || hrefMatch[3])
      : null;
    if (manifestUrl) {
      try {
        const { status, text } = await safeFetchText(manifestUrl, {
          maxBytes: 256 * 1024,
          timeoutMs: 5_000,
        });
        if (status >= 200 && status < 300 && text) {
          const parsed = JSON.parse(text) as { icons?: { src?: string }[] };
          const iconSrc = parsed.icons?.find((i) => typeof i.src === "string")?.src;
          if (iconSrc) {
            const url = resolveHref(iconSrc) ?? new URL(iconSrc, manifestUrl).toString();
            if (url && (await verifyIsImage(url))) {
              trace.source = "manifest";
              trace.result = url;
              logger.info(trace, "scrapeLogoUrl trace");
              return url;
            }
          }
        }
      } catch (err) {
        logger.warn({ err, manifestUrl }, "scrapeLogoUrl: manifest fetch/parse failed");
      }
    }
  }

  // 3) <meta property="og:image"> — site's own social-share image.
  const ogMatch = html.match(/<meta\b[^>]*\bproperty\s*=\s*["']og:image["'][^>]*>/i);
  if (ogMatch) {
    const contentMatch = ogMatch[0].match(/\bcontent\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i);
    const ogUrl = contentMatch
      ? resolveHref(contentMatch[1] || contentMatch[2] || contentMatch[3])
      : null;
    if (ogUrl && (await verifyIsImage(ogUrl))) {
      trace.source = "og-image";
      trace.result = ogUrl;
      logger.info(trace, "scrapeLogoUrl trace");
      return ogUrl;
    }
  }

  // 4) /favicon.ico probe — only accept if the response is actually an image.
  try {
    const faviconUrl = new URL("/favicon.ico", homepageUrl).toString();
    const { status, contentType } = await safeFetchText(faviconUrl, {
      maxBytes: 256 * 1024,
      timeoutMs: 5_000,
    });
    const isImage =
      contentType.startsWith("image/") || contentType.includes("icon") || contentType === "";
    if (status >= 200 && status < 300 && isImage) {
      trace.source = "favicon.ico";
      trace.result = faviconUrl;
      logger.info(trace, "scrapeLogoUrl trace");
      return faviconUrl;
    }
    trace.faviconIcoStatus = status;
    trace.faviconIcoContentType = contentType;
  } catch (err) {
    logger.warn({ err }, "scrapeLogoUrl: favicon.ico probe failed");
    trace.faviconIcoError = err instanceof Error ? err.message : String(err);
  }

  trace.source = "none";
  trace.result = null;
  logger.info(trace, "scrapeLogoUrl trace");
  return null;
}

function normalizeBaseUrl(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
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
  if (!process.env.OPENAI_API_KEY) {
    logger.warn({ brandId }, "factExtractor: OPENAI_API_KEY missing — skipping");
    return 0;
  }
  const brand = await storage.getBrandById(brandId);
  if (!brand) {
    logger.warn({ brandId }, "factExtractor: brand not found");
    return 0;
  }
  if (!brand.website) {
    logger.info({ brandId }, "factExtractor: brand has no website — skipping");
    return 0;
  }

  const base = normalizeBaseUrl(brand.website);
  if (!base) {
    logger.warn(
      { brandId, website: brand.website },
      "factExtractor: website URL malformed — skipping",
    );
    return 0;
  }
  logger.info({ brandId, base }, "factExtractor: starting scrape");

  const existing = await storage.getBrandFacts(brandId);
  const existingKeys = new Set(
    existing.map(
      (f: BrandFactSheet) => `${f.factCategory.toLowerCase()}::${f.factKey.toLowerCase()}`,
    ),
  );

  let inserted = 0;

  if (!brand.logoUrl) {
    try {
      const { status, text } = await safeFetchText(base + "/", {
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 10_000,
      });
      if (status >= 200 && status < 300) {
        const logoUrl = await scrapeLogoUrl(base + "/", text);
        if (logoUrl) {
          try {
            await storage.updateBrand(brandId, { logoUrl } as any);
          } catch (err) {
            logger.warn({ err, brandId }, "factExtractor: logo persist failed");
          }
        }
      }
    } catch (err) {
      logger.warn({ err, brandId }, "factExtractor: logo fetch failed");
    }
  }

  for (const path of FACT_PAGE_PATHS) {
    const url = `${base}${path}`;
    let pageText = "";
    try {
      const { status, text } = await safeFetchText(url, {
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 10_000,
      });
      if (status < 200 || status >= 300) continue;
      pageText = htmlToText(text).slice(0, MAX_PAGE_CHARS);
      if (pageText.length < 200) continue; // page too empty to be useful
    } catch {
      // SSRF block, network failure, etc. Skip page.
      continue;
    }

    const facts = await extractFactsFromText(pageText, brand, path).catch((err) => {
      logger.warn({ err, brandId, url }, "factExtractor: extraction threw");
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
        logger.warn({ err, brandId, cat, key }, "factExtractor: fact insert failed");
      }
    }
  }

  logger.info({ brandId, inserted }, "factExtractor: scrape complete");
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
        content: `You extract structured facts about a company from a single web page. The page may be a landing page, an /about page, a /pricing page, or any other subpage — adapt what you extract to what's present. Return JSON: {"facts": [{"factCategory": string, "factKey": string, "factValue": string, "confidence": 0-100}]}.

Rules:
- factCategory must be one of: founding, funding, team, products, pricing, locations, achievements, other
- factKey is lowercase_snake_case (e.g. "year_founded", "series_b_amount", "ceo_name", "hq_city")
- factValue is a short plain string (e.g. "2018", "$25M", "Jane Doe", "San Francisco")
- One fact per row — don't bundle multiple pieces into one value
- On a landing page, "tagline" and "target_audience" are valid "other" facts; "core_features" is a valid "products" fact.
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

  try {
    const parsed = parseLLMJson(completion.choices[0]?.message?.content, factsResponseSchema);
    return parsed.facts.filter(
      (f) => f && typeof f.factKey === "string" && typeof f.factValue === "string",
    );
  } catch (err) {
    if (err instanceof LLMParseError) {
      logger.warn(
        { err: err.message, raw: err.raw.slice(0, 300), brandId: brand.id, pagePath },
        "factExtractor: LLM returned non-conforming JSON",
      );
      return [];
    }
    throw err;
  }
}

/**
 * Monthly refresh. For every scraped fact with a sourceUrl, re-fetch the page,
 * re-extract, compare. Updates factValue if changed; stamps lastVerified either way.
 */
export async function refreshScrapedFacts(
  brandId: string,
): Promise<{ updated: number; checked: number }> {
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
      const { status, text } = await safeFetchText(url, {
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 10_000,
      });
      if (status < 200 || status >= 300) continue;
      pageText = htmlToText(text).slice(0, MAX_PAGE_CHARS);
    } catch {
      continue;
    }

    const fresh = await extractFactsFromText(pageText, brand, new URL(url).pathname).catch(
      () => [] as ExtractedFact[],
    );
    const freshMap = new Map(
      fresh.map((f) => [
        `${(f.factCategory || "").toLowerCase()}::${(f.factKey || "").toLowerCase()}`,
        f.factValue,
      ]),
    );

    for (const existing of group) {
      const key = `${existing.factCategory.toLowerCase()}::${existing.factKey.toLowerCase()}`;
      const newValue = freshMap.get(key);
      if (newValue && newValue !== existing.factValue) {
        try {
          await storage.updateBrandFact(existing.id, {
            factValue: String(newValue).slice(0, 1000),
            lastVerified: new Date(),
          } as any);
          updated += 1;
        } catch (err) {
          console.warn(
            `[factExtractor] refresh update failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      } else {
        try {
          await storage.updateBrandFact(existing.id, { lastVerified: new Date() } as any);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { updated, checked: scraped.length };
}
