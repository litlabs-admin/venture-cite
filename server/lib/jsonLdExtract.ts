// JSON-LD @type extraction — pulled out of server/routes/geoSignals.ts so it
// can be reused by server/lib/pageContentAnalysis.ts without pulling in that
// route file's Express/DB import chain (routesShared -> ownership -> db,
// which throws at import time when DATABASE_URL isn't set — exactly the kind
// of thing a "pure, framework-free" analyser must never depend on).
// geoSignals.ts re-exports these two names for backwards compatibility with
// any other importer; this file is the single source of truth.

export function collectSchemaNodes(node: unknown, out: Map<string, object[]>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectSchemaNodes(child, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const types: string[] = [];
  if (typeof t === "string") types.push(t);
  else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") types.push(x);
  for (const ty of types) {
    const arr = out.get(ty) ?? [];
    arr.push(obj);
    out.set(ty, arr);
  }
  for (const key of Object.keys(obj)) {
    if (key === "@type") continue;
    collectSchemaNodes(obj[key], out);
  }
}

export function parseJsonLdFromHtml(html: string): Map<string, object[]> {
  const out = new Map<string, object[]>();
  const scan = (source: string) => {
    const re =
      /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const raw = m[1]?.trim();
      if (!raw) continue;
      try {
        collectSchemaNodes(JSON.parse(raw), out);
      } catch {
        /* skip malformed block */
      }
    }
  };
  scan(html);
  const nsRe = /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi;
  let n: RegExpExecArray | null;
  while ((n = nsRe.exec(html)) !== null) {
    if (n[1]) scan(n[1]);
  }
  return out;
}
