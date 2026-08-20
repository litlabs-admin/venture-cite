// Turning a fetched HTML page into the text a brand-profile LLM reads.
//
// Both entry points that build a brand profile (POST
// /api/brands/create-from-website and the onboarding SSE scrape) used to
// carry their own copy of a strip-the-tags regex chain. Two problems came
// out of that, both reported as "it returned the logo and nothing else":
//
//  1. A client-rendered site has no body text at all. humanarc.io serves
//     `<div id="root"></div>` and a script tag - the tag strip yields ~0
//     characters, the onboarding route's `length > 200` gate then skips the
//     LLM entirely, and the user reaches the confirm screen with every field
//     blank. The page is not actually contentless: its <head> carries a
//     title, a meta description and Open Graph tags that describe the
//     product in full. Stripping tags threw all of it away, because that
//     content lives in attributes rather than between tags.
//
//  2. HTML entities were passed through raw. A real fetch of the
//     VentureCite homepage carried 53 of them, so the model read
//     `competitor&#x27;s` and `&quot;daily trainer&quot;`.
//
// So: read the head metadata first, decode entities, and put the metadata
// in front of the body text. A single-page app now yields a real
// description instead of nothing, and a server-rendered site is unchanged
// apart from the metadata prefix and correct punctuation.
//
// ponytail: regex, not a DOM parser. This feeds a language model, not a
// layout engine - it does not need to be correct about malformed nesting,
// and a parser dependency would be a lot of bytes to buy punctuation.

/** Named entities worth handling. Numeric forms are handled generically. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      // Reject NaN, out-of-range, and surrogate halves rather than emit U+FFFD.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole;
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

/**
 * Content of the first <meta> whose name or property matches `key`.
 *
 * `key` is interpolated into a RegExp unescaped. Every caller passes a fixed
 * literal made of letters, ":" and "-", none of which are regex
 * metacharacters. The assertion keeps that true if someone later passes a
 * value from a page instead of a constant.
 */
function metaContent(html: string, key: string): string {
  if (!/^[a-zA-Z0-9:_-]+$/.test(key)) {
    throw new Error(`metaContent: unsafe key ${JSON.stringify(key)}`);
  }
  // content= may sit on either side of name=/property=, so try both orders.
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decodeEntities(m[1].trim());
  }
  return "";
}

/**
 * The <head> metadata a brand-profile model can use: title, description and
 * the Open Graph / Twitter equivalents. Deduplicated, because sites commonly
 * repeat the same sentence across og: and twitter:.
 */
export function extractHeadMetadata(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const parts = [
    decodeEntities(title.replace(/\s+/g, " ").trim()),
    metaContent(html, "description"),
    metaContent(html, "og:site_name"),
    metaContent(html, "og:title"),
    metaContent(html, "og:description"),
    metaContent(html, "twitter:title"),
    metaContent(html, "twitter:description"),
    metaContent(html, "application-name"),
  ].filter(Boolean);

  const seen = new Set<string>();
  const unique = parts.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join(" — ");
}

/** Visible body text, with scripts, styles and tags removed. */
export function extractBodyText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export interface PageContent {
  /** Metadata + body text, capped at `maxChars`. What the model reads. */
  text: string;
  /** Head metadata alone. Non-empty for most sites, including SPAs. */
  metadata: string;
  /** Body text alone. Near-zero for a client-rendered page. */
  bodyText: string;
  /**
   * True when the body is effectively empty but the head describes the site -
   * i.e. a single-page app. The caller has real content to send, and it came
   * from metadata only, so it is thinner than a server-rendered page.
   */
  isClientRendered: boolean;
}

export function extractPageContent(html: string, maxChars = 8_000): PageContent {
  const metadata = extractHeadMetadata(html);
  const bodyText = extractBodyText(html);
  // 200 chars is the same threshold the onboarding route used to gate the LLM
  // call on; below it a page has a nav bar and nothing else to say.
  const isClientRendered = bodyText.length < 200 && metadata.length > 0;
  const text = [metadata, bodyText].filter(Boolean).join("\n\n").slice(0, maxChars);
  return { text, metadata, bodyText, isClientRendered };
}
