// Spec 2 §4.2 Phase 2 step 1: URL canonicalization for in-run dedup.
//
// Pure function; no I/O. Used by the executor before robots check + before
// the per-run "have we already fetched this page?" lookup. Stable across
// repeated calls so two runs that hit the same page from different anchors
// (`/about` and `/about/?utm_source=hp`) collapse to one canonical key.

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_EXACT = new Set(["ref", "fbclid", "gclid", "mc_eid", "mc_cid", "utm"]);

export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  // Lowercase host. `URL` already lowercases scheme; host needs explicit work.
  url.hostname = url.hostname.toLowerCase();

  // Normalize www. → apex. Conservative: only strip a leading `www.` label.
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
  }

  // Strip tracking params.
  const params = Array.from(url.searchParams.entries()).filter(([k]) => {
    if (TRACKING_PARAM_EXACT.has(k)) return false;
    return !TRACKING_PARAM_PREFIXES.some((p) => k.startsWith(p));
  });
  // Sort for stable output.
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [k, v] of params) url.searchParams.append(k, v);

  // Drop fragments.
  url.hash = "";

  // Strip trailing slash on non-root paths.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}
