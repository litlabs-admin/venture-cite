export type BrandQueryInput = {
  name: string | null | undefined;
  nameVariations: string[] | null | undefined;
};

export type ScanQueries = {
  reddit: string | null;
  hackernews: string | null;
  variations: string[];
};

export function collectVariations(brand: BrandQueryInput): string[] {
  const all = [brand.name, ...(Array.isArray(brand.nameVariations) ? brand.nameVariations : [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of all) {
    if (typeof raw !== "string") continue;
    const v = raw.trim();
    if (v.length < 2) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function buildScanQueries(brand: BrandQueryInput): ScanQueries {
  const variations = collectVariations(brand);
  if (variations.length === 0) {
    return { reddit: null, hackernews: null, variations: [] };
  }
  const reddit = `(${variations.map((v) => `title:"${v}" OR selftext:"${v}"`).join(" OR ")})`;
  // HN Algolia: quoted phrase search returns 0 hits in HN's instance.
  // Send the primary brand name unquoted; the brand-presence gate enforces
  // precision against the returned content using all variations.
  const hackernews = variations[0];
  return { reddit, hackernews, variations };
}
