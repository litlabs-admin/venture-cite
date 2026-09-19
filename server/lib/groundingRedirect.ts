// Gemini's OpenRouter grounding returns citation URLs that point at Google's
// own redirect shim (vertexaisearch.cloud.google.com/grounding-api-redirect/
// <token>) instead of the real page. Every downstream consumer of citation
// URLs - structuredCitations, geo_rankings.citedUrls, citingOutletUrl,
// classifySourceType, computeAuthorityScore - needs the real URL, not the
// redirect wrapper, so this resolves the wrapper to its target exactly once,
// at the point citation URLs first come out of a provider response.
//
// Tokens expire (observed: a token stored 2026-08-11 now 404s). A HEAD
// request against a dead token returns no Location, so those URLs are
// dropped rather than kept as a dead-end redirect link.
import { assertSafeUrl } from "./ssrf";
import { logger } from "./logger";

const REDIRECT_HOST = "vertexaisearch.cloud.google.com";
const REDIRECT_PATH_PREFIX = "/grounding-api-redirect/";
const HEAD_TIMEOUT_MS = 3000;
const CONCURRENCY = 6;

// Bounded cache: this process may resolve the same token many times across a
// run (several tasks citing the same grounded search hit). Caps at a size
// that comfortably covers one run without growing unbounded across the
// process lifetime. `null` is a cached negative result (drop).
const MAX_CACHE_SIZE = 5000;
const cache = new Map<string, string | null>();

function isGroundingRedirectUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.hostname === REDIRECT_HOST && url.pathname.startsWith(REDIRECT_PATH_PREFIX);
}

function cacheSet(key: string, value: string | null): void {
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
    // Evict the oldest entry (Map preserves insertion order) rather than
    // growing forever. This is a hot-path cache, not a durable record.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

// Resolve a single grounding-redirect URL to its target, or null to drop it.
// Never throws - every failure mode (404, timeout, malformed/unsafe
// Location, network error) resolves to null so the caller can drop the URL
// instead of propagating a redirect link nobody can use.
async function resolveOne(redirectUrl: string): Promise<string | null> {
  const cached = cache.get(redirectUrl);
  if (cached !== undefined) return cached;

  let result: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    try {
      const res = await fetch(redirectUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (location) {
          const resolved = new URL(location, redirectUrl).toString();
          // The redirect host is a fixed Google host, but the Location it
          // hands back is attacker-influenced data (the token controls what
          // it points to) - validate it the same way any other externally
          // supplied URL is validated before it flows into the app.
          await assertSafeUrl(resolved);
          result = resolved;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.info(
      { err: err instanceof Error ? err.message : String(err), redirectUrl },
      "groundingRedirect.resolve_failed",
    );
    result = null;
  }

  cacheSet(redirectUrl, result);
  return result;
}

// Resolve every vertexaisearch grounding-redirect URL in `urls` to its real
// target. Non-redirect URLs pass through unchanged, in order. Redirect URLs
// that fail to resolve (expired token, timeout, unsafe Location) are
// dropped, never kept as the dead redirect link. Output is deduplicated,
// keeping first-seen order, since several distinct tokens can resolve to the
// same page.
export async function resolveGroundingRedirects(urls: string[]): Promise<string[]> {
  const resolved: (string | null)[] = new Array(urls.length);

  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const idx = cursor++;
      if (idx >= urls.length) return;
      const url = urls[idx];
      resolved[idx] = isGroundingRedirectUrl(url) ? await resolveOne(url) : url;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker()));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of resolved) {
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
