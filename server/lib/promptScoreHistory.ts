// Per-prompt score history — the SCORE / Δ / sparkline columns on the prompts
// table.
//
// A prompt's score for one run is the share of that run's platform checks that
// cited the brand. Rows are bucketed by `runId`, falling back to the calendar
// day for legacy rows written before runs were recorded; without that fallback
// every such row becomes its own "run" and the sparkline turns into noise.
//
// Kept out of the route so it can be tested without a database.

export type ScoreRankingRow = {
  brandPromptId: string | null;
  runId: string | null;
  aiPlatform?: string | null;
  isCited: number;
  rank: number | null;
  checkedAt: Date | string | null;
};

export type PromptScoreEntry = {
  promptId: string;
  score: number | null;
  delta: number | null;
  series: Array<{ at: string; score: number; cited: number; checks: number; rank: number | null }>;
  runs: number;
  lastRunAt: string | null;
  /** Mean rank across cited placements in the latest run, or null when the
   *  brand was not ranked at all. */
  rank: number | null;
  /** Change in mean rank vs the previous run. POSITIVE MEANS WORSE — rank 3
   *  slipping to rank 7 is +4. Null when there is nothing to compare. */
  rankDelta: number | null;
  /** Latest rank per model, and how it moved since the previous run.
   *  `isNew` marks a model that placed for the first time — the detail
   *  page shows "new" there rather than a meaningless delta. */
  byPlatform: Array<{
    platform: string;
    rank: number | null;
    rankDelta: number | null;
    isNew: boolean;
  }>;
};

export const DEFAULT_POINTS = 7;
export const MAX_POINTS = 30;

/** Clamp a caller-supplied `points` value into the supported range. */
export function resolvePoints(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_POINTS;
  return Math.min(Math.max(Math.trunc(n), 2), MAX_POINTS);
}

export function buildPromptScoreHistory(
  promptIds: string[],
  rankings: ScoreRankingRow[],
  maxPoints: number = DEFAULT_POINTS,
): PromptScoreEntry[] {
  type Bucket = { cited: number; checks: number; at: number; rankSum: number; rankCount: number };
  // promptId -> bucketKey -> tallies
  const byPrompt = new Map<string, Map<string, Bucket>>();
  // promptId -> platform -> bucketKey -> { at, rank }
  const byPromptPlatform = new Map<
    string,
    Map<string, Map<string, { at: number; rank: number | null }>>
  >();

  for (const r of rankings) {
    if (!r.brandPromptId) continue;
    const at = r.checkedAt ? new Date(r.checkedAt).getTime() : 0;
    if (!at || Number.isNaN(at)) continue;
    const bucket = r.runId ?? new Date(at).toISOString().slice(0, 10);
    let buckets = byPrompt.get(r.brandPromptId);
    if (!buckets) {
      buckets = new Map();
      byPrompt.set(r.brandPromptId, buckets);
    }
    const cur = buckets.get(bucket) ?? { cited: 0, checks: 0, at, rankSum: 0, rankCount: 0 };
    cur.checks += 1;
    if (r.isCited === 1) cur.cited += 1;
    // Only real placements count toward mean rank. An uncited check has no
    // rank, and folding it in as 0 would flatter the average.
    if (typeof r.rank === "number" && r.rank > 0) {
      cur.rankSum += r.rank;
      cur.rankCount += 1;
    }
    // Keep the newest timestamp in the bucket so ordering stays stable even
    // when one run's rows are written across several seconds.
    cur.at = Math.max(cur.at, at);
    buckets.set(bucket, cur);

    // Second index: prompt -> platform -> run, for the per-model Δ column.
    const platform = r.aiPlatform;
    if (platform) {
      let plats = byPromptPlatform.get(r.brandPromptId);
      if (!plats) {
        plats = new Map();
        byPromptPlatform.set(r.brandPromptId, plats);
      }
      let runsForPlatform = plats.get(platform);
      if (!runsForPlatform) {
        runsForPlatform = new Map();
        plats.set(platform, runsForPlatform);
      }
      const rank = typeof r.rank === "number" && r.rank > 0 ? r.rank : null;
      const existing = runsForPlatform.get(bucket);
      // One row per (platform, run); if a re-run wrote several, the latest
      // one with a real rank wins.
      if (!existing || at >= existing.at) {
        runsForPlatform.set(bucket, { at, rank: rank ?? existing?.rank ?? null });
      }
    }
  }

  const meanRank = (b: Bucket) =>
    b.rankCount > 0 ? Math.round((b.rankSum / b.rankCount) * 10) / 10 : null;

  return promptIds.map((promptId) => {
    const buckets = [...(byPrompt.get(promptId)?.values() ?? [])].sort((a, b) => a.at - b.at);
    const kept = buckets.slice(-maxPoints);
    const series = kept.map((b) => ({
      at: new Date(b.at).toISOString(),
      score: b.checks > 0 ? Math.round((b.cited / b.checks) * 100) : 0,
      cited: b.cited,
      checks: b.checks,
      rank: meanRank(b),
    }));
    const score = series.length ? series[series.length - 1].score : null;
    // A delta needs two real observations. One run is not a trend, and
    // reporting 0 there would read as "measured, unchanged".
    const delta = series.length >= 2 ? score! - series[series.length - 2].score : null;

    const rank = series.length ? series[series.length - 1].rank : null;
    const prevRank = series.length >= 2 ? series[series.length - 2].rank : null;
    // Both runs must have produced a rank; a prompt that went from ranked to
    // unranked has no meaningful numeric slip.
    const rankDelta =
      rank !== null && prevRank !== null ? Math.round((rank - prevRank) * 10) / 10 : null;

    // Per-model rank, diffed against the previous run of the same model.
    const platBuckets = byPromptPlatform.get(promptId);
    const byPlatform = [...(platBuckets?.entries() ?? [])]
      .map(([platform, runsForPlatform]) => {
        const ordered = [...runsForPlatform.values()].sort((a, b) => a.at - b.at);
        const ranked = ordered.filter((x) => x.rank !== null);
        const latest = ranked.length ? ranked[ranked.length - 1] : null;
        const prior = ranked.length >= 2 ? ranked[ranked.length - 2] : null;
        return {
          platform,
          rank: latest ? latest.rank : null,
          rankDelta: latest && prior ? latest.rank! - prior.rank! : null,
          // Placed now, never placed before.
          isNew: !!latest && !prior,
        };
      })
      .sort((a, b) => a.platform.localeCompare(b.platform));

    return {
      promptId,
      score,
      delta,
      series,
      runs: buckets.length,
      lastRunAt: buckets.length ? new Date(buckets[buckets.length - 1].at).toISOString() : null,
      rank,
      rankDelta,
      byPlatform,
    };
  });
}
