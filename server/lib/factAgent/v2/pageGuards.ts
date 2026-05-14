// Six independent early-return guards for the static-page source.
// Each is a pure function so they're trivially testable. The composer
// calls them in this order before any LLM call:
//   1. isNonHtml (skip binaries entirely)
//   2. isWafBlocked (yield to search-LLM)
//   3. detectCanonicalRedirect (re-queue the canonical URL)
//   4. isSoft404 (skip "not found" pages)
//   5. isCookieWall (skip pre-consent shells)
//   6. isHollowShell (skip pure-CSR SPAs with no metadata)
import { canonicalizeUrl } from "../canonicalize";

/** Detect WAF/CDN block. Cloudflare and most CDNs set `cf-ray` on every
 *  response; we only treat as a block when paired with 403/503. */
export function isWafBlocked(
  statusCode: number,
  headers: Record<string, string | undefined>,
): boolean {
  if (statusCode !== 403 && statusCode !== 503) return false;
  const cfRay = headers["cf-ray"] ?? headers["CF-Ray"];
  const server = (headers["server"] ?? headers["Server"] ?? "").toLowerCase();
  return Boolean(cfRay) || server.includes("cloudflare") || server.includes("akamai");
}

/** Detect Cloudflare/SPA 200-with-not-found-content "soft 404". Only triggers
 *  when hydration is absent — if hydration exists, trust the page. */
const NOT_FOUND_PATTERNS = [
  /\bpage not found\b/i,
  /\bnot found\b/i,
  /\b404\b/,
  /\bcoming soon\b/i,
  /\bunder construction\b/i,
  /\bthis page does not exist\b/i,
];
export function isSoft404(text: string, hadHydration: boolean): boolean {
  if (hadHydration) return false;
  if (text.length > 600) return false; // real article-length pages don't get this guard
  const hits = NOT_FOUND_PATTERNS.filter((p) => p.test(text)).length;
  return hits >= 1 && text.length < 600;
}

/** Detect EU cookie/consent walls. Short page + prominent consent keywords +
 *  no hydration. Real pages that mention cookies in content have hundreds
 *  of words around the mention, which fails the length cap. */
const CONSENT_KEYWORDS = /\b(cookie|consent|gdpr|accept all|privacy preferences|opt in)\b/gi;
export function isCookieWall(text: string, hadHydration: boolean): boolean {
  if (hadHydration) return false;
  if (text.length >= 2000) return false;
  const hits = (text.match(CONSENT_KEYWORDS) ?? []).length;
  return hits >= 2;
}

/** Detect a pure-CSR SPA with nothing extractable. */
export interface HollowShellInput {
  hadHydration: boolean;
  hadRsc: boolean;
  hasStructuredData: boolean;
  bodyTextLength: number;
}
const HOLLOW_BODY_THRESHOLD = 200;
export function isHollowShell(input: HollowShellInput): boolean {
  if (input.hadHydration || input.hadRsc) return false;
  if (input.hasStructuredData) return false;
  return input.bodyTextLength < HOLLOW_BODY_THRESHOLD;
}

/** Skip non-HTML responses (PDFs, images, ZIPs, etc.). */
export function isNonHtml(contentType: string | null | undefined): boolean {
  if (!contentType) return false; // browsers default to text/html; mirror that.
  const ct = contentType.toLowerCase();
  if (ct.startsWith("text/html")) return false;
  if (ct.startsWith("text/plain")) return false;
  if (ct.startsWith("application/xhtml")) return false;
  return true;
}

/** Strip only tracking params (utm_*, fbclid, gclid, etc.) and fragments —
 *  but preserve the hostname as-is (no www-stripping). Used to compare
 *  canonical tags against the request URL: www.example.com and example.com
 *  may serve different content so we must respect that distinction here. */
function stripTrackingOnly(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.hostname = url.hostname.toLowerCase();
  const TRACKING_EXACT = new Set(["ref", "fbclid", "gclid", "mc_eid", "mc_cid", "utm"]);
  const params = Array.from(url.searchParams.entries()).filter(
    ([k]) => !TRACKING_EXACT.has(k) && !k.startsWith("utm_"),
  );
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [k, v] of params) url.searchParams.append(k, v);
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

/** Detect `<link rel="canonical">` pointing somewhere other than the request URL.
 *  Tracking params are stripped before comparison, but hostname differences
 *  (including www vs apex) are preserved — they may serve different content. */
export function detectCanonicalRedirect(html: string, requestUrl: string): string | null {
  const m =
    /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(html) ??
    /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i.exec(html);
  if (!m?.[1]) return null;
  const canonical = m[1].trim();
  if (!canonical) return null;
  let resolved: string;
  try {
    resolved = new URL(canonical, requestUrl).toString();
  } catch {
    return null;
  }
  if (stripTrackingOnly(resolved) === stripTrackingOnly(requestUrl)) return null;
  return resolved;
}
