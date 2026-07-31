// AI engines quote URLs verbatim, tracking params and all - "?utm_source=chatgpt.com"
// is routinely embedded in the text they return. Rendering those unmodified both
// looks unpolished and silently carries tracking identifiers into the user's
// browser when they click through.
//
// Lives here rather than in each renderer because three components need it
// (the Overview "how AI describes you" block, PlatformRankingCard and
// VerbatimResponseCard) and byte-identical copies drift.
//
// The key list mirrors `server/lib/factAgent/canonicalize.ts` - if you add one
// there, add it here too. They are deliberately separate because this one runs
// on model output in the browser and that one canonicalises crawled URLs on the
// server; sharing a module across that boundary would drag server code into the
// client bundle.
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set(["ref", "fbclid", "gclid", "mc_eid", "mc_cid", "utm"]);

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  return TRACKING_PARAMS.has(lower) || TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * Removes tracking parameters from every URL found in a block of text, leaving
 * the surrounding prose untouched.
 *
 * Anything that does not parse as a URL is returned unchanged - model output is
 * not trustworthy input, and a malformed link should render as-written rather
 * than disappear.
 */
export function stripTrackingParams(text: string): string {
  return text.replace(/https?:\/\/[^\s)\]]+/g, (match) => {
    try {
      const url = new URL(match);
      let changed = false;
      for (const key of Array.from(url.searchParams.keys())) {
        if (isTrackingParam(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (!changed) return match;
      const cleaned = url.toString();
      return cleaned.endsWith("?") ? cleaned.slice(0, -1) : cleaned;
    } catch {
      return match;
    }
  });
}
