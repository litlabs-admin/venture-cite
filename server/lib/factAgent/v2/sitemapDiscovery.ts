// Sitemap discovery for the fact-agent v2 planner.
// Fallback chain:
//   1. <brand>/sitemap.xml
//   2. <brand>/sitemap_index.xml
//   3. Sitemap: directive in <brand>/robots.txt
//
// Each fetch is capped at 500 KB. Parses up to the first 200 <loc> entries
// from the matched sitemap. Filters out URLs not on the brand's registered
// domain (e.g. strips CDN/affiliate links that sometimes appear in sitemaps).

export interface SitemapFetcher {
  (url: string, opts?: { maxBytes?: number }): Promise<{ status: number; text: string }>;
}

const SITEMAP_BYTE_CAP = 500_000;
const MAX_ENTRIES = 200;

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

function parseLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && out.length < MAX_ENTRIES) {
    const raw = m[1].trim();
    if (raw) out.push(raw);
  }
  return out;
}

async function tryFetchSitemap(fetcher: SitemapFetcher, url: string): Promise<string[]> {
  try {
    const res = await fetcher(url, { maxBytes: SITEMAP_BYTE_CAP });
    if (res.status >= 200 && res.status < 300 && res.text) {
      return parseLocs(res.text);
    }
  } catch {
    // Network errors — silently skip.
  }
  return [];
}

function parseRobotsForSitemap(text: string): string | null {
  const m = /^\s*Sitemap:\s*(\S+)\s*$/im.exec(text);
  return m?.[1] ?? null;
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

  // 1. Try /sitemap.xml
  let urls = await tryFetchSitemap(fetcher, `${origin}/sitemap.xml`);

  // 2. Fall back to /sitemap_index.xml
  if (urls.length === 0) {
    urls = await tryFetchSitemap(fetcher, `${origin}/sitemap_index.xml`);
  }

  // 3. Fall back to Sitemap: directive in robots.txt
  if (urls.length === 0) {
    try {
      const robots = await fetcher(`${origin}/robots.txt`, { maxBytes: 100_000 });
      if (robots.status >= 200 && robots.status < 300) {
        const sitemapUrl = parseRobotsForSitemap(robots.text);
        if (sitemapUrl) {
          urls = await tryFetchSitemap(fetcher, sitemapUrl);
        }
      }
    } catch {
      // ignore
    }
  }

  // Filter to URLs on the same registered domain only.
  return urls.filter((u) => {
    try {
      return registeredDomain(new URL(u).hostname) === brandRegistered;
    } catch {
      return false;
    }
  });
}
