// Brand-confusion guard for the search-LLM source.
//
// Perplexity browses the open web. For a common-name brand ("Linear" the
// SaaS vs "Linear" the algebra library), it may confidently return facts
// from the wrong entity. We mitigate by requiring every fact's sourceUrl
// to be:
//   - on the brand's apex domain (any subdomain OK), OR
//   - on a known social/press allowlist (LinkedIn, Crunchbase, Twitter/X,
//     a few reputable news domains).
//
// Apex matches keep their LLM-assigned confidence. Social matches are
// CAPPED at 0.5 — they're real but not first-hand. Off-allowlist facts
// are dropped entirely.
import type { Fact } from "@shared/factAgent/schema";

const SOCIAL_ALLOWLIST: Array<{ host: string; pathPrefix?: string }> = [
  { host: "linkedin.com", pathPrefix: "/company/" },
  { host: "www.linkedin.com", pathPrefix: "/company/" },
  { host: "crunchbase.com", pathPrefix: "/organization/" },
  { host: "www.crunchbase.com", pathPrefix: "/organization/" },
  { host: "twitter.com" },
  { host: "www.twitter.com" },
  { host: "x.com" },
  { host: "www.x.com" },
];

const SOCIAL_CONFIDENCE_CAP = 0.5;

/**
 * Returns the registered domain (eTLD+1) for a given hostname.
 * Handles common two-part TLDs (co.uk, co.jp, etc.) explicitly.
 */
function registeredDomain(host: string): string {
  const MULTI_PUBLIC_SUFFIXES = ["co.uk", "co.jp", "com.au", "co.in", "co.za", "com.br", "com.mx"];
  const h = host.toLowerCase();
  for (const sfx of MULTI_PUBLIC_SUFFIXES) {
    if (h.endsWith("." + sfx)) {
      const parts = h.slice(0, -sfx.length - 1).split(".");
      const apex = parts[parts.length - 1];
      return `${apex}.${sfx}`;
    }
  }
  const parts = h.split(".");
  if (parts.length < 2) return h;
  return parts.slice(-2).join(".");
}

/**
 * Checks whether a source URL is allowed for the given brand URL.
 *
 * Returns:
 *   "apex"   — URL is on the brand's apex domain (any subdomain)
 *   "social" — URL is on the social/press allowlist
 *   false    — URL is off-allowlist or malformed
 */
export function isAllowedSourceUrl(
  url: string | undefined,
  brandUrl: string,
): "apex" | "social" | false {
  if (!url) return false;
  let u: URL;
  let b: URL;
  try {
    u = new URL(url);
    b = new URL(brandUrl);
  } catch {
    return false;
  }
  // Apex domain check: same registered domain → apex
  const uReg = registeredDomain(u.hostname);
  const bReg = registeredDomain(b.hostname);
  if (uReg === bReg) return "apex";

  // Social allowlist check
  for (const entry of SOCIAL_ALLOWLIST) {
    if (u.hostname.toLowerCase() === entry.host) {
      if (!entry.pathPrefix || u.pathname.startsWith(entry.pathPrefix)) {
        return "social";
      }
    }
  }

  return false;
}

/**
 * Filters a list of facts to only those whose sourceUrl is on the brand's
 * apex domain or the social allowlist. Social-allowlist facts have their
 * confidence capped at SOCIAL_CONFIDENCE_CAP (0.5). Facts with no sourceUrl
 * are dropped.
 */
export function filterByBrandDomain(facts: Fact[], brandUrl: string): Fact[] {
  const out: Fact[] = [];
  for (const f of facts) {
    const verdict = isAllowedSourceUrl(f.sourceUrl, brandUrl);
    if (verdict === false) continue;
    if (verdict === "apex") {
      out.push(f);
    } else {
      // social: cap confidence
      out.push({
        ...f,
        confidence: Math.min(f.confidence, SOCIAL_CONFIDENCE_CAP),
      });
    }
  }
  return out;
}
