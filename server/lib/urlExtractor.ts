const MAX_URLS = 20;
const MAX_URL_LENGTH = 2048;

// Matches markdown links AND plain http(s) URLs. Captured group is the
// URL itself. Stops at whitespace, closing brackets/parens, or ", < >.
const URL_PATTERN = /(?:\[[^\]]*\]\((https?:\/\/[^\s)<>"]+)\))|(https?:\/\/[^\s)<>"]+)/g;

// Trailing punctuation that shouldn't be part of the URL when extracted
// from prose (sentences end with these). Note: "?" is intentionally NOT
// stripped because URLs commonly end with query strings.
const TRAILING_PUNCT = /[.,;:!]+$/;

/** Extract URLs the LLM cited in its response text. Handles markdown
 *  links + plain URLs. Strips trailing punctuation. Validates http/https
 *  + hostname-with-dot. Dedupes case-insensitive on hostname, exact on
 *  path. Caps at 20 URLs and 2 KB per URL. Pure function. */
export function extractCitedUrls(text: string): string[] {
  if (!text) return [];

  const seen = new Map<string, string>(); // dedupe key (host.lower + path) → original URL
  const ordered: string[] = []; // preserve insertion order

  // Reset the global regex state because RegExp.exec is stateful.
  URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    let url = raw.replace(TRAILING_PUNCT, "");
    if (url.length > MAX_URL_LENGTH) {
      url = url.slice(0, MAX_URL_LENGTH);
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (!parsed.hostname.includes(".")) continue;

    const dedupeKey = `${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}`;
    if (seen.has(dedupeKey)) continue;
    seen.set(dedupeKey, url);
    ordered.push(url);

    if (ordered.length >= MAX_URLS) break;
  }

  return ordered;
}
