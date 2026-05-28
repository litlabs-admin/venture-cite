// Hybrid URL discovery: combines sitemap + homepage nav graph + LLM
// ranking. Replaces the regex-based selectTopUrls when
// FACT_AGENT_LLM_URL_RANKER=true is set.
//
// Flow:
//   1. Sitemap discovery (existing module). Yields canonical page URLs.
//   2. Homepage nav extraction (new module). Yields the brand's
//      curated nav links with anchor labels.
//   3. Optional Jina-rendered nav extraction (if homepage is hollow
//      shell) so React/Vue SPAs whose nav is JS-rendered also
//      contribute candidates.
//   4. LLM ranker scores every candidate with anchor text + source
//      hints. Returns the top N.
//
// Why this beats the regex approach:
//   - Sitemap and nav are complementary: sitemap gives breadth,
//     nav gives the brand's own curatorial intent.
//   - The LLM looks at URL pattern AND anchor text AND source region.
//     A regex sees only the URL pattern.
//   - Adaptive: brands using non-standard paths (/heritage,
//     /our-method) score correctly without code changes.
//
// Safety:
//   - Hard cap on candidates sent to LLM (100, sorted heuristically)
//   - Hard timeout on LLM call (15 s via the ranker)
//   - Callers should catch errors and fall back to selectTopUrls()

import { canonicalizeUrl } from "../canonicalize";
import { discoverSitemapUrls, type SitemapFetcher } from "./sitemapDiscovery";
import { extractHomepageNavLinks } from "./homepageNavExtractor";
import { fetchViaJina, isJinaAvailable } from "./jinaFallback";
import { rankUrls, type RankerLlmCallable, type UrlCandidate } from "./urlRanker";
import { logger } from "../../logger";

const MAX_CANDIDATES_TO_RANK = 100;
const DEFAULT_MAX_RESULTS = 10;

interface PageFetcher {
  (
    url: string,
    opts?: { maxBytes?: number },
  ): Promise<{
    status: number;
    text: string;
  }>;
}

export interface HybridDiscoveryOpts {
  brandUrl: string;
  brandName?: string;
  industry?: string | null;
  /** Fetcher used to fetch both sitemap files and homepage HTML.
   *  Pass the same SSRF-protected fetcher used elsewhere. */
  fetcher: SitemapFetcher & PageFetcher;
  /** LLM callable. The ranker will pass the json_schema for strict
   *  validation. */
  llm: RankerLlmCallable;
  maxResults?: number;
}

export interface HybridDiscoveryResult {
  urls: string[];
  /** Provenance for the inspector — which source contributed each URL
   *  and what the LLM ranker said about it. */
  provenance: Array<{
    url: string;
    sources: Array<"sitemap" | "nav" | "header" | "footer" | "jsonld">;
    rankerScore: number | null;
    rankerReason: string | null;
  }>;
  /** Counters surface in event log to track which sources work for
   *  which brands over time. */
  counters: {
    sitemapCount: number;
    navCount: number;
    candidatesRanked: number;
    jinaFallbackUsed: boolean;
  };
}

function dedupCandidates(candidates: UrlCandidate[]): UrlCandidate[] {
  // Same URL from multiple sources collapses to one candidate. The
  // sources list grows so the ranker can weigh it appropriately. We
  // preserve the BEST anchor label (longest non-empty wins).
  const byUrl = new Map<string, UrlCandidate & { _sources: Set<string> }>();
  for (const c of candidates) {
    const canonical = canonicalizeUrl(c.url);
    const prior = byUrl.get(canonical);
    if (prior) {
      prior._sources.add(c.source);
      if (c.label && (!prior.label || c.label.length > prior.label.length)) {
        prior.label = c.label;
      }
    } else {
      byUrl.set(canonical, {
        url: canonical,
        source: c.source,
        label: c.label,
        _sources: new Set([c.source]),
      });
    }
  }
  return Array.from(byUrl.values()).map((v) => ({
    url: v.url,
    source: v.source,
    label: v.label,
  }));
}

/** Pre-truncate to MAX_CANDIDATES_TO_RANK using a cheap heuristic so
 *  we don't blow the LLM prompt. Heuristic: prefer shorter paths
 *  (more likely top-level), prefer nav-sourced over sitemap-only. */
function preTruncate(candidates: UrlCandidate[]): UrlCandidate[] {
  if (candidates.length <= MAX_CANDIDATES_TO_RANK) return candidates;
  return [...candidates]
    .sort((a, b) => {
      const sa = a.source === "sitemap" ? 1 : 0;
      const sb = b.source === "sitemap" ? 1 : 0;
      if (sa !== sb) return sa - sb; // nav/header/footer first
      try {
        const da = new URL(a.url).pathname.split("/").filter(Boolean).length;
        const db = new URL(b.url).pathname.split("/").filter(Boolean).length;
        if (da !== db) return da - db; // shallower first
        return a.url.length - b.url.length;
      } catch {
        return 0;
      }
    })
    .slice(0, MAX_CANDIDATES_TO_RANK);
}

export async function hybridDiscoverUrls(
  opts: HybridDiscoveryOpts,
): Promise<HybridDiscoveryResult> {
  const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;
  const counters = {
    sitemapCount: 0,
    navCount: 0,
    candidatesRanked: 0,
    jinaFallbackUsed: false,
  };

  // 1. Sitemap.
  let sitemapCandidates: UrlCandidate[] = [];
  try {
    const sitemapUrls = await discoverSitemapUrls(opts.brandUrl, opts.fetcher);
    sitemapCandidates = sitemapUrls.map((u) => ({ url: u, source: "sitemap" as const }));
    counters.sitemapCount = sitemapUrls.length;
  } catch (err) {
    logger.warn({ err, brandUrl: opts.brandUrl }, "hybridDiscoverUrls: sitemap failed");
  }

  // 2. Homepage nav.
  let navCandidates: UrlCandidate[] = [];
  try {
    const home = new URL(opts.brandUrl);
    const homepageOrigin = `${home.protocol}//${home.host}/`;
    const homepageRes = await opts.fetcher(homepageOrigin, { maxBytes: 500_000 });
    if (homepageRes.status >= 200 && homepageRes.status < 300 && homepageRes.text) {
      const navLinks = extractHomepageNavLinks(homepageRes.text, opts.brandUrl);
      navCandidates = navLinks.map((n) => ({
        url: n.url,
        source:
          n.region === "nav" || n.region === "header" || n.region === "footer" ? n.region : "nav",
        label: n.label,
      }));
      // 2a. Hollow-shell fallback: if the homepage is JS-rendered and
      // had no nav extraction, retry via Jina Reader so SPAs still
      // contribute nav links.
      if (navCandidates.length === 0 && isJinaAvailable()) {
        const jina = await fetchViaJina(homepageOrigin);
        if (jina.ok) {
          // Jina returns markdown. Convert markdown links to nav
          // candidates: parse [label](url) patterns.
          const mdLinkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
          let m: RegExpExecArray | null;
          const seen = new Set<string>();
          const brandHost = new URL(opts.brandUrl).hostname;
          while ((m = mdLinkRe.exec(jina.markdown)) !== null) {
            const label = m[1].slice(0, 80).toLowerCase();
            const linkUrl = m[2];
            try {
              const parsed = new URL(linkUrl);
              if (!parsed.hostname.endsWith(brandHost.split(".").slice(-2).join("."))) {
                continue;
              }
              const c = canonicalizeUrl(linkUrl);
              if (seen.has(c)) continue;
              seen.add(c);
              navCandidates.push({ url: c, source: "nav", label });
              if (navCandidates.length >= 50) break;
            } catch {
              continue;
            }
          }
          counters.jinaFallbackUsed = true;
        }
      }
      counters.navCount = navCandidates.length;
    }
  } catch (err) {
    logger.warn({ err, brandUrl: opts.brandUrl }, "hybridDiscoverUrls: nav extraction failed");
  }

  // 3. Combine + dedup.
  const combined = dedupCandidates([...sitemapCandidates, ...navCandidates]);

  // Always include homepage as a candidate even if neither layer surfaced it.
  try {
    const home = new URL(opts.brandUrl);
    const homepageCanonical = canonicalizeUrl(`${home.protocol}//${home.host}/`);
    if (!combined.find((c) => c.url === homepageCanonical)) {
      combined.unshift({ url: homepageCanonical, source: "nav", label: "homepage" });
    }
  } catch {
    // brandUrl unparseable; ignore
  }

  if (combined.length === 0) {
    return { urls: [], provenance: [], counters };
  }

  // 4. Pre-truncate + rank via LLM.
  const truncated = preTruncate(combined);
  counters.candidatesRanked = truncated.length;

  let ranked: Awaited<ReturnType<typeof rankUrls>>;
  try {
    ranked = await rankUrls(
      truncated,
      {
        brandUrl: opts.brandUrl,
        brandName: opts.brandName,
        industry: opts.industry,
        maxResults,
      },
      opts.llm,
    );
  } catch (err) {
    logger.warn(
      { err, brandUrl: opts.brandUrl },
      "hybridDiscoverUrls: ranker failed, falling back to depth-sorted truncation",
    );
    // Fallback: return the pre-truncated list (depth + source heuristic).
    ranked = truncated.slice(0, maxResults).map((c) => ({
      url: c.url,
      score: 5,
      reason: "ranker_fallback",
    }));
  }

  const candidateByUrl = new Map(truncated.map((c) => [c.url, c]));
  const provenance = ranked.map((r) => {
    const c = candidateByUrl.get(r.url);
    return {
      url: r.url,
      sources: c
        ? ([c.source] as Array<"sitemap" | "nav" | "header" | "footer" | "jsonld">)
        : ["sitemap" as const],
      rankerScore: r.score,
      rankerReason: r.reason,
    };
  });

  return {
    urls: ranked.map((r) => r.url),
    provenance,
    counters,
  };
}
