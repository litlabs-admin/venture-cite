// Pure extractors for the static-page source.
// - extractStructuredData pulls <title>, meta name|property, JSON-LD.
//   This is the highest-signal text we can get from a SPA because the
//   <head> is server-rendered even when the body is empty.
// - stripToBodyText strips all tags and returns a single whitespace-collapsed
//   string. Used as a supplementary signal, never primary.

export interface StructuredDataResult {
  text: string;
  hasStructuredData: boolean;
}

const WANTED_META =
  /^(description|keywords|author|og:|twitter:|application-name|apple-mobile-web-app-title)/i;

export function extractStructuredData(html: string): StructuredDataResult {
  const parts: string[] = [];

  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title?.[1]) {
    const t = title[1].trim();
    if (t) parts.push(`Title: ${t}`);
  }

  // <meta name|property="..." content="..."> in either attribute order
  const metaRe1 =
    /<meta\b[^>]*(?:name|property)\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi;
  const metaRe2 =
    /<meta\b[^>]*content\s*=\s*["']([^"']*)["'][^>]*(?:name|property)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const seen = new Set<string>();
  const collect = (key: string, value: string) => {
    if (!WANTED_META.test(key)) return;
    const k = key.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    const v = value.trim();
    if (v) parts.push(`${k}: ${v}`);
  };
  let m: RegExpExecArray | null;
  while ((m = metaRe1.exec(html)) !== null) collect(m[1], m[2]);
  while ((m = metaRe2.exec(html)) !== null) collect(m[2], m[1]);

  // JSON-LD blocks
  const jsonLdRe =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = jsonLdRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      parts.push(`JSON-LD: ${JSON.stringify(parsed)}`);
    } catch {
      // Drop malformed entries silently — they're not extractable signal.
    }
  }

  const text = parts.join("\n");
  return { text, hasStructuredData: text.length > 0 };
}

export function stripToBodyText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
