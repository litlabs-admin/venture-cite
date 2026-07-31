// Fold leaderboard rows that are the same company.
//
// Two curated ("core") competitor rows can share a domain under different
// names - "Samsung" and "Samsung Electronics" both sit on samsung.com - and
// the uniqueness index is (brand_id, lower(name), lower(domain)), so nothing
// upstream prevents the pair.
//
// Domain is the ONLY safe merge key, and only for core rows. The
// citation-mined `discovered` pool stores the hostname of the first cited URL
// rather than the entity's own site (S Pen -> thecreatorinsider.com, Leica ->
// cnet.com, Garmin -> wired.com), so merging that pool on domain would fold
// Leica into CNET. Callers must pass core rows only.
//
// Rows without a domain never merge: an empty string is not an identity.

export interface LeaderboardRow {
  name: string;
  domain: string;
  isOwn: boolean;
  totalCitations: number;
  platformBreakdown: Record<string, number>;
  shareOfVoice: number;
}

/** Registrable-ish host: strips scheme, www. and any path. */
export function normaliseDomainKey(domain: string | null | undefined): string {
  return (domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/**
 * Build the competitor rows of the leaderboard: one per CORE competitor,
 * carrying the citations of every row for the same company.
 *
 * Presentation is core-only - the leaderboard is a competitive set, so it
 * holds competitor brands and nothing else. But citations are keyed by
 * competitor row id, and the same company routinely exists as both a core row
 * and a citation-mined `discovered` one (measured live: core
 * `Spotify / spotify.com` had 0 citations while discovered `Spotify / ""` had
 * 11). Filtering before counting throws those away.
 *
 * The link is the normalised NAME, and only the name. Domain cannot be used:
 * the mining path stores the hostname of the first cited URL rather than the
 * entity's own site (S Pen -> thecreatorinsider.com, Leica -> cnet.com,
 * Garmin -> wired.com), so attributing on domain would credit Leica's
 * citations to CNET.
 *
 * A discovered row with no matching core row contributes nothing and does not
 * appear. That is the intended outcome for product lines ("iPhone", "S Pen"),
 * operating systems ("macOS") and publishers ("CNET"): mention data, not
 * competitors.
 */
export function buildCoreCompetitorRows(
  competitors: { id: string; name: string; domain: string; tier: string }[],
  citationsByCompetitorId: Map<string, Map<string, number>>,
): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  const byName = new Map<string, LeaderboardRow>();

  for (const c of competitors) {
    if (c.tier !== "core") continue;
    const key = c.name.trim().toLowerCase();
    if (byName.has(key)) continue; // two core rows, identical name
    const row: LeaderboardRow = {
      name: c.name,
      domain: c.domain,
      isOwn: false,
      totalCitations: 0,
      platformBreakdown: {},
      shareOfVoice: 0,
    };
    byName.set(key, row);
    rows.push(row);
  }

  for (const c of competitors) {
    const target = byName.get(c.name.trim().toLowerCase());
    if (!target) continue;
    const bucket = citationsByCompetitorId.get(c.id);
    if (!bucket) continue;
    bucket.forEach((count, platform) => {
      target.platformBreakdown[platform] = (target.platformBreakdown[platform] ?? 0) + count;
      target.totalCitations += count;
    });
  }

  return rows;
}

export function mergeLeaderboardByDomain(rows: LeaderboardRow[]): LeaderboardRow[] {
  const out: LeaderboardRow[] = [];
  const byDomain = new Map<string, LeaderboardRow>();

  // Own-brand rows are seeded first so a competitor sharing the brand's own
  // domain folds INTO the brand rather than the other way round, regardless
  // of input order.
  for (const row of rows) {
    if (!row.isOwn) continue;
    const key = normaliseDomainKey(row.domain);
    const copy = { ...row, platformBreakdown: { ...row.platformBreakdown } };
    if (key) byDomain.set(key, copy);
    out.push(copy);
  }

  for (const row of rows) {
    if (row.isOwn) continue;
    const key = normaliseDomainKey(row.domain);
    const copy = { ...row, platformBreakdown: { ...row.platformBreakdown } };
    if (!key) {
      out.push(copy);
      continue;
    }
    const existing = byDomain.get(key);
    if (!existing) {
      byDomain.set(key, copy);
      out.push(copy);
      continue;
    }
    existing.totalCitations += row.totalCitations;
    for (const [platform, n] of Object.entries(row.platformBreakdown)) {
      existing.platformBreakdown[platform] = (existing.platformBreakdown[platform] ?? 0) + n;
    }
    // Prefer the shorter label between two competitor rows: "Samsung" reads
    // better than "Samsung Electronics". The own-brand row keeps its name.
    if (!existing.isOwn && row.name.length < existing.name.length) existing.name = row.name;
  }

  return out;
}
