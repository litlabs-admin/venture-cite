// Homepage nav-link extractor.
//
// For brands whose sitemap is missing, sparse, or noisy, the homepage
// <nav>/<header>/<footer> usually contains the curated list of
// "important" links the brand wants visitors to see. We extract these
// candidates and feed them into the URL ranker alongside sitemap
// candidates. Combined, the ranker has a much broader candidate set
// to pick from.
//
// Heuristics for what counts as "nav-relevant":
//   - Inside <nav>, <header>, <footer> (HTML5 semantic markers — most
//     modern sites use these correctly)
//   - OR inside elements with class/id matching /nav|menu|header|footer/i
//     (works for older / hand-rolled sites)
//   - Same registered domain
//   - Path depth ≤ 3 segments (filters out individual blog posts /
//     product items / docs pages)
//   - Not a file URL (no .xml, .json, .pdf, etc.)
//   - Not a hash/mailto/tel: URL
//
// We cap at 50 unique URLs — beyond that is noise.

const MAX_NAV_URLS = 50;
const MAX_PATH_DEPTH = 3;

// File extensions that obviously aren't navigation targets.
const NON_PAGE_EXTENSIONS =
  /\.(xml|json|rss|atom|gz|txt|pdf|zip|csv|tsv|jpe?g|png|svg|webp|gif|ico|css|js|woff2?|ttf|otf)$/i;

interface NavLink {
  url: string;
  /** Anchor text or aria-label, normalised to lower-case. Used by the
   *  URL ranker as a hint about what each link is. */
  label: string;
  /** Which semantic region the link came from. */
  region: "nav" | "header" | "footer" | "main" | "unknown";
}

function registeredDomain(host: string): string {
  const h = host.toLowerCase();
  const MULTI = ["co.uk", "co.jp", "com.au", "co.in", "co.za", "com.br", "com.mx"];
  for (const sfx of MULTI) {
    if (h.endsWith("." + sfx)) {
      const parts = h.slice(0, -sfx.length - 1).split(".");
      return `${parts[parts.length - 1]}.${sfx}`;
    }
  }
  const parts = h.split(".");
  return parts.length < 2 ? h : parts.slice(-2).join(".");
}

/** Lightweight inner-text grabber for anchor labels. Strips HTML
 *  tags, collapses whitespace, caps to 80 chars. */
function extractLinkText(linkInner: string): string {
  return linkInner
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .toLowerCase();
}

/** Extract the inner text of an attribute (handles single + double
 *  quotes; returns empty string when missing). */
function attrValue(tag: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const m = re.exec(tag);
  return (m?.[2] ?? m?.[3] ?? "").trim();
}

/** Extract candidate nav links from a homepage HTML doc. Returns
 *  same-registered-domain, depth-bounded URLs paired with their
 *  anchor labels and the semantic region they came from. */
export function extractHomepageNavLinks(html: string, brandUrl: string): NavLink[] {
  let base: URL;
  try {
    base = new URL(brandUrl);
  } catch {
    return [];
  }
  const brandRegistered = registeredDomain(base.hostname);

  const seen = new Set<string>();
  const out: NavLink[] = [];

  // Strategy: extract each semantic region as a separate slice of the
  // HTML, then run an anchor-tag regex over each slice. The region
  // tag travels with the link so the LLM ranker can weigh links
  // differently (footer links are usually corporate/legal, nav links
  // are usually product/identity).
  const regions: Array<{ name: NavLink["region"]; pattern: RegExp }> = [
    { name: "nav", pattern: /<nav\b[^>]*>([\s\S]*?)<\/nav>/gi },
    { name: "header", pattern: /<header\b[^>]*>([\s\S]*?)<\/header>/gi },
    { name: "footer", pattern: /<footer\b[^>]*>([\s\S]*?)<\/footer>/gi },
    {
      name: "nav",
      pattern:
        /<(?:div|ul|section)\b[^>]*\b(?:class|id)\s*=\s*["'][^"']*(?:navigation|navbar|main-?menu)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|ul|section)>/gi,
    },
  ];

  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const region of regions) {
    region.pattern.lastIndex = 0;
    let regionMatch: RegExpExecArray | null;
    while ((regionMatch = region.pattern.exec(html)) !== null) {
      const slice = regionMatch[1];
      anchorRe.lastIndex = 0;
      let anchorMatch: RegExpExecArray | null;
      while ((anchorMatch = anchorRe.exec(slice)) !== null) {
        if (out.length >= MAX_NAV_URLS) break;
        const tag = anchorMatch[1];
        const href = attrValue(tag, "href");
        if (
          !href ||
          href.startsWith("#") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          href.startsWith("javascript:")
        ) {
          continue;
        }
        let url: URL;
        try {
          url = new URL(href, brandUrl);
        } catch {
          continue;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") continue;
        if (registeredDomain(url.hostname) !== brandRegistered) continue;
        if (NON_PAGE_EXTENSIONS.test(url.pathname)) continue;
        const depth = url.pathname.split("/").filter(Boolean).length;
        if (depth > MAX_PATH_DEPTH) continue;
        const canonical = `${url.protocol}//${url.host}${url.pathname}`.toLowerCase();
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        const label = extractLinkText(anchorMatch[2]) || attrValue(tag, "aria-label").toLowerCase();
        out.push({ url: url.toString(), label, region: region.name });
      }
      if (out.length >= MAX_NAV_URLS) break;
    }
    if (out.length >= MAX_NAV_URLS) break;
  }

  return out;
}
