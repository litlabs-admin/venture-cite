// Wave 9.4: detect when an LLM response in a citation run cites a URL
// the user has registered as their own (via bofu_content.publishedUrl
// or faq_items.publishedUrl → tracked_content_urls).
//
// This closes the loop between GEO Tools (where users generate +
// publish content) and the citation checker (which tracks whether the
// brand is being cited at all). Without this, users had no answer to
// "did the BOFU page I published last month actually get cited?"

import type { TrackedContentUrl } from "@shared/schema";

/**
 * Canonical form of a URL for cross-source matching:
 *   - lower-cased host with leading "www." stripped
 *   - lower-cased path with trailing slash stripped
 *   - query string + fragment dropped
 *   - http vs https treated as equivalent (no scheme in output)
 *
 * Returns null for unparseable input. Bare hosts (no scheme) are
 * accepted by prepending https://.
 */
export function normalizeUrl(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
  if (!host) return null;
  return path ? `${host}${path}` : host;
}

/**
 * Scan an LLM response (any text — analysis, citations, raw output)
 * for occurrences of the brand's tracked content URLs. Matching is
 * substring-based against `normalized_url` so a bare-host citation
 * ("acme.com/x") matches a stored "acme.com/x?utm=foo" and vice versa.
 *
 * Idempotent within a single response: each tracked URL contributes at
 * most one hit per call.
 */
export function findSelfCitationsInText(
  text: string,
  trackedUrls: TrackedContentUrl[],
): TrackedContentUrl[] {
  if (!text || trackedUrls.length === 0) return [];
  const haystack = text.toLowerCase();
  const hits = new Map<string, TrackedContentUrl>();
  for (const t of trackedUrls) {
    if (!t.normalizedUrl) continue;
    if (haystack.includes(t.normalizedUrl)) {
      hits.set(t.id, t);
    }
  }
  return Array.from(hits.values());
}
