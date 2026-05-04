/** Returns ±radius chars around the first case-insensitive, word-boundary
 *  match of any of `terms` within `text`. Adds "…" boundaries when
 *  truncated. If no match is found, returns the leading 2*radius chars
 *  (or full text if shorter) with a trailing "…". Pure function. */
export function extractSnippet(text: string, terms: string[], radius = 200): string {
  if (!text) return "";

  // Sort longest-first so "Stripe Inc" wins over "Stripe" when both are
  // candidates. Same approach as the rehype highlight plugin.
  const candidates = terms
    .filter((t) => t && t.trim().length > 0)
    .sort((a, b) => b.length - a.length);

  let matchIdx = -1;
  let matchLen = 0;

  for (const term of candidates) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    const m = re.exec(text);
    if (m && (matchIdx === -1 || m.index < matchIdx)) {
      matchIdx = m.index;
      matchLen = m[0].length;
    }
  }

  // No match found → return leading chunk with trailing ellipsis.
  if (matchIdx === -1) {
    if (text.length <= 2 * radius) return text;
    return text.slice(0, 2 * radius) + "…";
  }

  const start = Math.max(0, matchIdx - radius);
  const end = Math.min(text.length, matchIdx + matchLen + radius);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}
