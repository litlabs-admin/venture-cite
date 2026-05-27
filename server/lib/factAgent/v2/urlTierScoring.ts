// URL path tier scoring for /plan.
//
// 2026-05-28 production fix: the old regex set was too narrow for
// real-world enterprise URLs. Tier 1 only matched the exact strings
// "/about" / "/pricing" / "/team" / "/products". Real brands use
// "/who-we-are", "/our-company", "/leadership", "/case-studies/...",
// "/customers/...", "/solutions/...", etc. — all of which fell through
// to tier 0 and competed on equal footing with arbitrary sitemap noise.
// Broadened to capture the common variants while keeping the strict
// "no sub-segments for tier 1, anchor segments for tier 2" structure.
//
//   Tier 1 (priority 10): homepage + identity / business / pricing /
//     team / product pages. Single-segment paths only.
//   Tier 2 (priority 5):  features / solutions / customers / case-
//     studies / use-cases / contact / security / careers. May be
//     prefix-matched so /case-studies/<slug> is recognised.
//   Tier 3 (drop):        blog / press / news / author / tag / category
//     / legal / privacy / terms / cookie / integrations/* / /p/*
//     / template gallery / help / docs / status pages.
//   Untiered:             everything else, included with low priority
//     if room remains after Tier 1+2.
//
// Homepage is ALWAYS included as the first entry regardless of sitemap.
import { canonicalizeUrl } from "../canonicalize";

// Tier 1 — exact single-segment paths. Captures the company-identity
// landing pages every brand has under SOME name. Trailing slash already
// stripped by the caller before testing.
const TIER_1 =
  /^\/(?:|index\.html?|about(?:-us|-the-company)?|company|our-company|who-we-are|our-story|our-mission|mission|company-overview|overview|pricing(?:-plans)?|plans|team|leadership|founders|management|product|products|product-tour)$/i;

// Tier 2 — features, solutions, customers, case studies, use cases,
// contact, security, careers. PREFIX-matched on a `/` boundary so
// /case-studies/<slug>, /customers/<slug>, /solutions/<slug> all count.
const TIER_2 =
  /^\/(?:features?|platform|solutions?|customers?|case-studies?|case-study|use-cases?|use-case|services?|contact(?:-us)?|security|trust|careers?|jobs|locations?|offices)(?:\/|$)/i;

// Tier 3 — prefix-match paths to DROP entirely. Adds press/news/help/
// docs/status/template-gallery to the previous list. These pages either
// don't describe the brand (press releases, blog posts), or are
// linked-out destinations (help, docs).
const TIER_3 =
  /^\/(?:blog|author|tag|category|legal|privacy(?:-policy)?|terms(?:-of-service)?|cookie(?:-policy)?|integrations|p|press|news|media|newsroom|help|docs|documentation|api-?docs|status|template-gallery|templates|partners|app|signin|signup|login|register|cart|checkout|account|dashboard|admin)(?:\/|$)/i;

const MAX_URLS = 10;

// Locale-prefix matcher. Strips an optional leading /xx/ or /xx-XX/ or
// /xx_XX/ segment before tier evaluation so /en-gb/about scores the
// same as /about. Production sites for global brands ALL prefix their
// URLs this way; without this stripping, every /en-gb/* URL fell
// through to tier 0 and competed on equal footing with arbitrary noise.
const LOCALE_PREFIX = /^\/([a-z]{2}(?:[-_][a-z]{2,3})?)(\/|$)/i;

function stripLocalePrefix(path: string): string {
  const m = LOCALE_PREFIX.exec(path);
  if (!m) return path;
  // Slice off the locale segment but preserve the leading slash so
  // tier regexes (which anchor with `^\/`) still match.
  return path.slice(m[1].length + 1) || "/";
}

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
  // Try the original path first, then with the locale prefix stripped.
  // Both forms get the same score; the locale variant just falls back
  // to the de-localised form.
  const candidates = [path, stripLocalePrefix(path)];
  for (const p of candidates) {
    if (TIER_1.test(p)) return 1;
    if (TIER_2.test(p)) return 2;
    if (TIER_3.test(p)) return 3;
  }
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

  // Tier-0 fallback: prefer DIVERSE paths and SHORT paths over the
  // sitemap's incidental order. Without this, Samsung's sitemap (which
  // happens to list 200+ sustainability sub-pages first) fills every
  // remaining slot with sustainability/* — leaving the actual brand-
  // identity pages unscraped. Sort by:
  //   1. Path depth ASC (shorter = more likely top-level)
  //   2. Path length ASC (tiebreaker)
  // and cap to at most 3 URLs per parent prefix so no single section
  // monopolises the budget.
  const sortedTier0 = [...tier0].sort((a, b) => {
    try {
      const pa = new URL(a).pathname;
      const pb = new URL(b).pathname;
      const da = pa.split("/").filter(Boolean).length;
      const db = pb.split("/").filter(Boolean).length;
      if (da !== db) return da - db;
      return pa.length - pb.length;
    } catch {
      return 0;
    }
  });
  const perParentCount = new Map<string, number>();
  const MAX_PER_PARENT = 3;
  for (const u of sortedTier0) {
    if (out.length >= MAX_URLS) break;
    let parent: string;
    try {
      const parts = new URL(u).pathname.split("/").filter(Boolean);
      parent = parts[0] ?? "/";
    } catch {
      parent = "/";
    }
    const count = perParentCount.get(parent) ?? 0;
    if (count >= MAX_PER_PARENT) continue;
    perParentCount.set(parent, count + 1);
    push(u);
  }

  return out;
}
