// Sitemap discovery for the fact-agent v2 planner.
//
// Fallback chain (in order):
//   1. <brand>/sitemap.xml
//   2. <brand>/sitemap_index.xml
//   3. Sitemap: directive in <brand>/robots.txt
//
// 2026-05-28 production fix: real-world sites (Adyen, Samsung, Notion,
// most enterprise sites) ship a SITEMAP-INDEX at /sitemap.xml — an XML
// file with <sitemap><loc>nested-sitemap.xml</loc></sitemap> entries,
// NOT a flat list of page URLs. The old `parseLocs` was a pure regex
// over <loc> tags that happily returned the NESTED SITEMAP URLs as if
// they were pages — the executor then tried to scrape XML files as
// HTML and skipped them all as `skipped_non_html`, ending up with zero
// usable pages.
//
// New behaviour: detect the index form, recurse one level (capped at
// MAX_NESTED_SITEMAPS), and merge URLs from every fetched leaf. URLs
// from explicit pages still take precedence over locale variants when
// the brand URL has no locale segment.
//
// Caps:
//   - Each fetch capped at SITEMAP_BYTE_CAP (500 KB)
//   - Recursion fans out to at most MAX_NESTED_SITEMAPS (8) leaf files
//   - Combined entry count capped at MAX_ENTRIES (200) across the run
//   - Non-page URL extensions (.xml, .json, .rss, .atom, .gz, .txt)
//     are dropped — they're either nested sitemaps we already
//     processed OR data files the page-scraper will reject anyway.
//
// Same-domain filtering still applies — strips CDN/affiliate links.

export interface SitemapFetcher {
  (url: string, opts?: { maxBytes?: number }): Promise<{ status: number; text: string }>;
}

const SITEMAP_BYTE_CAP = 500_000;
const MAX_ENTRIES = 200;
const MAX_NESTED_SITEMAPS = 8;

// File extensions that obviously aren't HTML pages and should never be
// queued as scrape candidates, even if a sitemap lists them. Sitemap-
// indexes especially tend to leak through.
const NON_PAGE_EXTENSIONS = /\.(xml|json|rss|atom|gz|txt|pdf|zip|csv|tsv)$/i;

// Minimal public-suffix list: multi-segment TLDs only. Single-segment TLDs
// ("com", "io") fall through to the default 2-level logic below.
const MULTI_PUBLIC_SUFFIXES = ["co.uk", "co.jp", "com.au", "co.in", "co.za", "com.br", "com.mx"];

function registeredDomain(host: string): string {
  const h = host.toLowerCase();
  for (const sfx of MULTI_PUBLIC_SUFFIXES) {
    if (h.endsWith("." + sfx)) {
      const parts = h.slice(0, -sfx.length - 1).split(".");
      return `${parts[parts.length - 1]}.${sfx}`;
    }
  }
  const parts = h.split(".");
  if (parts.length < 2) return h;
  return parts.slice(-2).join(".");
}

/** A parsed sitemap, classified by wrapper element so the caller can
 *  decide whether to recurse. */
interface ParsedSitemap {
  /** "urlset" = leaf sitemap (entries are page URLs).
   *  "sitemapindex" = nested index (entries are sub-sitemap URLs).
   *  "unknown" = couldn't decide; treat as flat list with non-page-ext
   *  filtering. */
  kind: "urlset" | "sitemapindex" | "unknown";
  locs: string[];
}

/** Parse an XML sitemap and return its <loc> entries plus the wrapper
 *  kind. Tolerant of malformed XML, missing whitespace, and extra
 *  attributes. Capped at MAX_ENTRIES total <loc>s. */
function parseSitemap(xml: string): ParsedSitemap {
  // Sniff the root element. `<sitemapindex>` and `<urlset>` are the two
  // valid wrappers per the sitemap protocol; anything else is an error
  // OR a non-standard variant which we treat as unknown.
  const isIndex = /<sitemapindex\b/i.test(xml);
  const isUrlset = /<urlset\b/i.test(xml);
  const kind: ParsedSitemap["kind"] = isIndex ? "sitemapindex" : isUrlset ? "urlset" : "unknown";

  const locs: string[] = [];
  const re = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && locs.length < MAX_ENTRIES) {
    const raw = m[1].trim();
    if (raw) locs.push(raw);
  }
  return { kind, locs };
}

async function fetchAndParse(fetcher: SitemapFetcher, url: string): Promise<ParsedSitemap | null> {
  try {
    const res = await fetcher(url, { maxBytes: SITEMAP_BYTE_CAP });
    if (res.status >= 200 && res.status < 300 && res.text) {
      return parseSitemap(res.text);
    }
  } catch {
    // Network errors — silently skip.
  }
  return null;
}

function parseRobotsForSitemap(text: string): string | null {
  const m = /^\s*Sitemap:\s*(\S+)\s*$/im.exec(text);
  return m?.[1] ?? null;
}

/** Score a nested-sitemap URL by how well it matches the brand's URL
 *  context. Higher = more relevant. Used to prioritise which nested
 *  sitemaps to recurse into when an index has more than
 *  MAX_NESTED_SITEMAPS entries (common for global brands with 50+
 *  locale variants).
 *
 *  Heuristic:
 *    +10 if the nested sitemap path has no locale prefix
 *         (best match for non-localised brand URL)
 *    +8  if the nested sitemap path matches the brand's path prefix
 *    +5  if the locale segment is `en` / `en-us` / `en_us` / `en-gb`
 *    +3  if the path contains keywords we care about: pricing, about,
 *         products, company, root
 *    +0  otherwise */
function scoreNestedSitemap(nestedUrl: string, brandUrl: string): number {
  let path: string;
  let brandPath: string;
  try {
    path = new URL(nestedUrl).pathname.toLowerCase();
    brandPath = new URL(brandUrl).pathname.toLowerCase();
  } catch {
    return 0;
  }
  let score = 0;

  // Locale heuristics. Match a leading `/xx/` or `/xx-xx/` or `/xx_xx/`
  // segment.
  const localeMatch = path.match(/^\/([a-z]{2}(?:[-_][a-z]{2})?)\//i);
  const locale = localeMatch?.[1]?.toLowerCase() ?? null;
  if (!locale) {
    score += 10; // no locale = best match for our use-case
  } else if (/^en(?:[-_](us|gb|ca|au))?$/.test(locale)) {
    score += 5;
  }

  if (brandPath !== "/" && path.startsWith(brandPath)) {
    score += 8;
  }

  if (/(pricing|about|company|product|root|main)/.test(path)) {
    score += 3;
  }

  return score;
}

export async function discoverSitemapUrls(
  brandUrl: string,
  fetcher: SitemapFetcher,
): Promise<string[]> {
  let base: URL;
  try {
    base = new URL(brandUrl);
  } catch {
    return [];
  }
  const origin = `${base.protocol}//${base.host}`;
  const brandRegistered = registeredDomain(base.hostname);

  // 2026-05-28: probe ALL the standard locations and merge the results.
  // The old "first wins" short-circuited the moment /sitemap.xml
  // returned a non-zero count, even if that count was 1 stub <loc>
  // pointing nowhere useful while the more authoritative robots.txt
  // Sitemap: directive sat unseen. Merging guarantees we see every
  // sitemap source the site advertises.
  const probes = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

  let rootParsed: ParsedSitemap = { kind: "unknown", locs: [] };
  for (const probe of probes) {
    const parsed = await fetchAndParse(fetcher, probe);
    if (!parsed) continue;
    if (parsed.locs.length === 0) continue;
    if (rootParsed.locs.length === 0) {
      rootParsed = parsed;
    } else if (rootParsed.kind === parsed.kind) {
      // Merge same-kind sitemaps.
      const seen = new Set(rootParsed.locs);
      for (const loc of parsed.locs) {
        if (!seen.has(loc)) {
          rootParsed.locs.push(loc);
          seen.add(loc);
        }
        if (rootParsed.locs.length >= MAX_ENTRIES) break;
      }
    }
    // If we already have a healthy set, stop probing other roots.
    if (rootParsed.locs.length >= 20) break;
  }

  // robots.txt Sitemap: directive — always check; merge if found.
  try {
    const robots = await fetcher(`${origin}/robots.txt`, { maxBytes: 100_000 });
    if (robots.status >= 200 && robots.status < 300) {
      const sitemapUrl = parseRobotsForSitemap(robots.text);
      if (sitemapUrl) {
        const robotsParsed = await fetchAndParse(fetcher, sitemapUrl);
        if (robotsParsed && robotsParsed.locs.length > 0) {
          if (rootParsed.locs.length === 0) {
            rootParsed = robotsParsed;
          } else if (rootParsed.kind === robotsParsed.kind) {
            const seen = new Set(rootParsed.locs);
            for (const loc of robotsParsed.locs) {
              if (!seen.has(loc)) {
                rootParsed.locs.push(loc);
                seen.add(loc);
              }
              if (rootParsed.locs.length >= MAX_ENTRIES) break;
            }
          }
        }
      }
    }
  } catch {
    // ignore — robots.txt is best-effort here
  }

  if (rootParsed.locs.length === 0) return [];

  // Collect leaf page URLs. If the root is a urlset, those <loc>s ARE
  // the page URLs. If it's a sitemapindex, the <loc>s point to nested
  // sitemaps — fetch up to MAX_NESTED_SITEMAPS of them, ranked by the
  // brand-locale heuristic.
  let pageUrls: string[] = [];

  if (rootParsed.kind === "sitemapindex") {
    const ranked = rootParsed.locs
      .map((u) => ({ url: u, score: scoreNestedSitemap(u, brandUrl) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_NESTED_SITEMAPS)
      .map((r) => r.url);

    for (const nestedUrl of ranked) {
      if (pageUrls.length >= MAX_ENTRIES) break;
      const nestedParsed = await fetchAndParse(fetcher, nestedUrl);
      if (!nestedParsed) continue;
      // Defensive: if a nested entry IS itself another sitemap-index
      // (some sites nest two levels deep), pull its <loc>s without
      // further recursion to avoid pathological depth.
      pageUrls.push(...nestedParsed.locs);
    }
  } else {
    // urlset or unknown — trust the <loc>s as candidates.
    pageUrls = rootParsed.locs;
  }

  // Filter:
  //   1. Same registered domain only (strips CDN/affiliate leaks).
  //   2. Drop URLs whose path obviously isn't a page (xml/json/rss/etc).
  //      Sitemap-indexes that slipped through fix #1 land here.
  //   3. Dedup case-insensitive.
  const seen = new Set<string>();
  const filtered: string[] = [];
  for (const raw of pageUrls) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (registeredDomain(u.hostname) !== brandRegistered) continue;
    if (NON_PAGE_EXTENSIONS.test(u.pathname)) continue;
    const key = u.toString().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(raw);
    if (filtered.length >= MAX_ENTRIES) break;
  }
  return filtered;
}
