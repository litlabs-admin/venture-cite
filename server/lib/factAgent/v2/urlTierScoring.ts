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
//
// 2026-05-28 (revised): Tier regexes broadened to capture the full
// spectrum of company-identity paths real brands use. Specific additions:
//
//   TIER_1: heritage, history, story, culture, values, vision, research,
//           safety, investors, locations, contact (was tier 2 — bumped
//           because contact pages reliably carry HQ + legal name)
//   TIER_2: testimonials, why-us, why-choose-us, changelog, roadmap,
//           methodology, method
//
// We also normalise separators before matching: `/our_company`,
// `/aboutus`, `/our-company` all collapse to the same canonical form.
//
// Tier 3 is more selective — `/integrations` only drops the listing
// page, individual `/integrations/<vendor>` pages now go to tier 0
// because for some brands (Zapier, Make) integrations ARE the product.
import { canonicalizeUrl } from "../canonicalize";

// Normalise hyphens/underscores/no-separator so "/our_company",
// "/our-company" and "/ourcompany" all hit the same matcher.
function normalizeSeparators(path: string): string {
  return path
    .replace(/[-_]+/g, "-") // _ and -- → single -
    .replace(/\/+/g, "/"); // collapse double slashes
}

// Tier 1 — exact single-segment paths. Trailing slash already stripped
// and separators normalised by the caller. NB: the `index.html?` clause
// is for static-site brands.
const TIER_1 =
  /^\/(?:|index\.html?|about(?:-us|-the-company)?|company|our-company|who-we-are|our-story|our-mission|mission|company-overview|overview|pricing(?:-plans)?|plans|team|leadership|management|product|products|product-tour|heritage|history|story|culture|values|vision|research|safety|investors?|impact|sustainability|approach)$/i;

// Tier 2 — features, solutions, customers, case studies, use cases,
// contact, security, careers, methodology. PREFIX-matched on `/` so
// /case-studies/<slug>, /customers/<slug>, /solutions/<slug> all count.
const TIER_2 =
  /^\/(?:features?|platform|solutions?|customers?|testimonials?|case-studies?|case-study|use-cases?|use-case|services?|contact(?:-us)?|security|trust|careers?|jobs|locations?|offices|why-us|why-choose-us|changelog|roadmap|methodology|method|our-work|portfolio|clients?)(?:\/|$)/i;

// Tier 3 — prefix-match paths to DROP entirely. Includes blog / press
// / news / legal / docs / help. NOTE: bare `/integrations` (no slash)
// dropped, but `/integrations/<vendor>` falls through to tier 0
// because integration pages ARE product pages for some brands.
const TIER_3 =
  /^\/(?:blog|author|tag|category|legal|privacy(?:-policy)?|terms(?:-of-service)?|cookie(?:-policy)?|p|press|news|media|newsroom|help|docs|documentation|api-?docs|status|template-gallery|templates|partners|app|signin|signup|login|register|cart|checkout|account|dashboard|admin|404|search|sitemap)(?:\/|$)/i;

const MAX_URLS = 10;

// Locale-prefix matcher. Strips an optional leading /xx/, /xx-XX/,
// /xx_XX/, or /xx-XXXX/ segment (the last for CJK script variants
// like /zh-hans/, /zh-hant/) AND non-ISO bucket prefixes (/global/,
// /worldwide/, /intl/, /international/).
//
// The language subtag is validated against the real ISO 639-1 set rather
// than matched as "any 2-3 letters". That shape was too permissive and
// caused a production mis-scoring bug: `/api` parsed as a locale, got
// stripped to `/`, and `/` matches TIER_1's empty alternative — so `/api`
// scored as the HOMEPAGE and took top scraping priority. `/faq`, `/seo`,
// `/app` and `/dev` all did the same, crowding real brand-identity pages
// out of the 10-URL budget on any site that has them.
//
// Requiring a real language code is what makes stripping safe: `/en` and
// `/en/about` still collapse correctly, while `/api/pricing` no longer
// masquerades as `/pricing`.
//
// Trade-off, deliberate: 3-letter ISO 639-2/3 codes (e.g. `/fil/`) are no
// longer stripped. Those are rare on marketing sites, and the failure mode
// is mild — the page falls through to tier 0 (still eligible) rather than
// being mis-promoted to tier 1. The old behaviour's failure mode was the
// expensive direction.
const ISO_639_1 = new Set(
  (
    "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv " +
    "cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr " +
    "ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw " +
    "ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv " +
    "ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr " +
    "ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi " +
    "yo za zh zu"
  ).split(" "),
);

// Captures the language subtag separately so it can be validated above.
const LOCALE_PREFIX = /^\/([a-z]{2})(?:[-_]([a-z]{2,4}))?(\/|$)/i;
const NON_ISO_BUCKET = /^\/(global|worldwide|intl|international|english)(\/|$)/i;

function stripLocalePrefix(path: string): string {
  const localeMatch = LOCALE_PREFIX.exec(path);
  if (localeMatch && ISO_639_1.has(localeMatch[1].toLowerCase())) {
    // Length of the matched segment: language + optional [-_]region.
    const segment = localeMatch[2] ? `${localeMatch[1]}-${localeMatch[2]}` : localeMatch[1];
    return path.slice(segment.length + 1) || "/";
  }
  const bucketMatch = NON_ISO_BUCKET.exec(path);
  if (bucketMatch) {
    return path.slice(bucketMatch[1].length + 1) || "/";
  }
  return path;
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
  // Normalise separators so /our_company, /our-company, /ourcompany hit
  // the same matcher. Then test against locale-stripped + original.
  const normalized = normalizeSeparators(path);
  const candidates = [normalized, stripLocalePrefix(normalized)];
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
      // 2026-05-28 (revised): strip the locale prefix BEFORE computing
      // the "parent" segment. Without this, /in/about, /in/products,
      // /in/contact all count as parent="/in/" and the per-parent cap
      // collapses to 3 country pages instead of 3 DIFFERENT topics.
      let path = new URL(u).pathname;
      path = normalizeSeparators(path);
      path = stripLocalePrefix(path);
      const parts = path.split("/").filter(Boolean);
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
