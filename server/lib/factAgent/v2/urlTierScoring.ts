// URL path tier scoring for /plan.
//   Tier 1 (priority 10): homepage, about, company, pricing, team, product
//   Tier 2 (priority 5):  features, platform, contact, customers, security
//   Tier 3 (drop):        blog, author, tag, category, legal, privacy,
//                         terms, cookie, integrations/*, /p/*
//   Untiered:             everything else, included with low priority if
//                         room remains after Tier 1+2.
//
// Homepage is ALWAYS included as the first entry regardless of sitemap.
import { canonicalizeUrl } from "../canonicalize";

// Exact-match paths (no sub-segments). Trailing slash already stripped
// by the caller before testing.
const TIER_1 = /^\/(?:|index\.html?|about(-us)?|company|pricing(-plans)?|team|products?)$/i;
const TIER_2 = /^\/(?:features|platform|contact(-us)?|customers|security)$/i;
// Prefix-match paths: these segments and everything beneath them are noise.
const TIER_3 =
  /^\/(?:blog|author|tag|category|legal|privacy(-policy)?|terms(-of-service)?|cookie(-policy)?|integrations|p)(\/|$)/i;

const MAX_URLS = 10;

/**
 * Returns the tier score for a URL:
 *   1 = high-priority (always include)
 *   2 = medium-priority (include if room)
 *   3 = drop (noise/legal/blog)
 *   0 = untiered (include last if room)
 */
export function scoreUrl(url: string): 0 | 1 | 2 | 3 {
  let path: string;
  try {
    path = new URL(url).pathname.replace(/\/$/, "") || "/";
  } catch {
    return 0;
  }
  if (TIER_1.test(path)) return 1;
  if (TIER_2.test(path)) return 2;
  if (TIER_3.test(path)) return 3;
  return 0;
}

function homepageOf(brandUrl: string): string {
  try {
    const u = new URL(brandUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return brandUrl;
  }
}

/**
 * Select at most MAX_URLS (10) canonical URLs to scrape for a brand.
 *
 * Order: homepage first, then Tier 1, then Tier 2, then untiered (Tier 0).
 * Tier 3 URLs are always dropped.
 * Duplicates (after canonicalisation) are removed.
 */
export function selectTopUrls(brandUrl: string, candidates: string[]): string[] {
  const home = homepageOf(brandUrl);
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (url: string) => {
    const canonical = canonicalizeUrl(url);
    if (seen.has(canonical)) return;
    seen.add(canonical);
    out.push(canonical);
  };

  // Homepage is always first.
  push(home);

  const tier1: string[] = [];
  const tier2: string[] = [];
  const tier0: string[] = [];
  for (const u of candidates) {
    const t = scoreUrl(u);
    if (t === 1) tier1.push(u);
    else if (t === 2) tier2.push(u);
    else if (t === 0) tier0.push(u);
    // Tier 3 is silently dropped.
  }

  for (const u of tier1) {
    if (out.length >= MAX_URLS) break;
    push(u);
  }
  for (const u of tier2) {
    if (out.length >= MAX_URLS) break;
    push(u);
  }
  for (const u of tier0) {
    if (out.length >= MAX_URLS) break;
    push(u);
  }

  return out;
}
