// Pure relevance-band logic for discovered competitors. Kept import-free (no
// storage/db graph) so it can be unit-tested in isolation.
//
// The list each discovery source returns is ordered most-direct-first, so a
// lower index means a stronger match. Profile inference scores in the core
// band (60-100); citation mining, a noisier "appeared alongside" signal,
// scores in the discovered band (25-55). The bands don't overlap, so an
// AI-direct competitor always outranks a mined one in a shared pool.
export function relevanceForRank(source: "ai" | "citation_mining", index: number): number {
  return source === "ai" ? Math.max(60, 100 - index * 5) : Math.max(25, 55 - index * 4);
}
