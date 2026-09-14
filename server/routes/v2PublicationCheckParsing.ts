// The read-only half of the publication check: turning a fetched page's HTML
// into the two signals board 16 asks for. Kept in its own module, with no
// imports beyond the standard library, so it can be unit-tested without
// pulling in `../auth` -> `../supabase`, which throws at import time when
// `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are not set - true for a plain
// unit-test run, and exactly the failure a route-file-only test file hit
// before this split.

/** The first `<link rel="canonical" ...>` in the document, order-insensitive
 *  on the `rel`/`href` attribute order real templates emit. `undefined` when
 *  the page declares none - never guessed from the requested URL. */
export function extractCanonicalUrl(html: string): string | undefined {
  const linkTagPattern = /<link\b[^>]*>/gi;
  for (const [tag] of html.matchAll(linkTagPattern)) {
    const relMatch = /\brel\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!relMatch || !/\bcanonical\b/i.test(relMatch[1])) continue;
    const hrefMatch = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (hrefMatch && hrefMatch[1].trim()) return hrefMatch[1].trim();
  }
  return undefined;
}

/** Whether the fetch returned readable body text at all - the one signal
 *  this endpoint can state without a ground-truth string to compare against
 *  (the completion rule's `content_change` evidence records a page URL, not
 *  the exact wording the edit introduced). A stripped-tag character count
 *  keeps a page that is pure markup/whitespace from counting as "present". */
export function hasReadableText(html: string): boolean {
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .trim();
  return stripped.length > 0;
}
