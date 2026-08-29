# B6a-03: geo-opportunities full-table-scan fix

## What I verified before changing anything

`storage.getGeoRankingsByArticleIds(ids, sinceDate?)` lives in
`server/storage/citationsStorage.ts:186-195`:

```ts
async getGeoRankingsByArticleIds(ids: string[], sinceDate?: Date): Promise<GeoRanking[]> {
  if (ids.length === 0) return [];
  const conditions = [inArray(schema.geoRankings.articleId, ids)];
  if (sinceDate) conditions.push(gte(schema.geoRankings.checkedAt, sinceDate));
  return await db
    .select()
    .from(schema.geoRankings)
    .where(and(...conditions))
    .orderBy(desc(schema.geoRankings.checkedAt));
},
```

With `sinceDate` omitted, the `since` condition is never pushed onto the
`and(...)` list, so the query is exactly `WHERE article_id IN (ids)`,
ordered by `checkedAt desc`. It behaves identically to the old
`getGeoRankings()` + `.filter((r) => r.articleId && articles.some(a => a.id === r.articleId))`
in every respect except:

- it no longer reads every row in `geo_rankings` (every brand's rows), only
  rows matching this brand's article ids - an indexed scan instead of a
  full-table scan;
- it returns rows ordered by `checkedAt desc` instead of whatever order the
  unfiltered `SELECT *` happened to return them in.

I checked every downstream use of `articleRankings` in
`/api/geo-opportunities/:brandId` (`server/routes/analytics.ts:781-953`):
it's only ever merged into `cited` and then reduced with `for` loops that
count into `reddit`/`ownSite`/`thirdParty`/`perPlatform` buckets. Nothing
slices, sorts, or reads array position, so the new ordering has no effect
on the response. Omitting `since` does not change which rows come back,
only the order - confirmed, no reason to stop.

## The change

`server/routes/analytics.ts`, inside `GET /api/geo-opportunities/:brandId`:
replaced

```ts
const articleRankings = articles.length
  ? (await storage.getGeoRankings()).filter(
      (r) => r.articleId && articles.some((a) => a.id === r.articleId),
    )
  : [];
```

with

```ts
const articleIds = articles.map((a) => a.id);
const articleRankings = articleIds.length
  ? await storage.getGeoRankingsByArticleIds(articleIds)
  : [];
```

No `since` argument is passed - this route keeps reporting against the
brand's entire history, matching its current (pre-fix) behavior exactly.
`storage.getGeoRankings()` (the full-table read) is no longer called
anywhere in this route. Nothing else in the handler, in `dashboard.ts`, or
in `/api/geo-analytics/:brandId` was touched.

## Test

Added `tests/unit/geoOpportunitiesRankings.test.ts`, mounting only
`setupAnalyticsRoutes` on a bare Express app with a stubbed `storage`
(same pattern as `tests/unit/dashboardGapMatrix.test.ts`). Three cases:

1. The response's `totalCitedRankings` and `keyStats` come out identical
   to what the old filter-in-memory logic would have produced from the
   same fixture rows (one brand-prompt-tied Reddit citation, one
   article-tied own-site citation, one uncited row, and one row belonging
   to a different brand's article that must NOT leak in).
2. `storage.getGeoRankingsByArticleIds` is called exactly once with only
   this brand's article ids (`["a1"]`), and `storage.getGeoRankings` is
   never called - asserting the absence of the global scan, so a future
   regression back to the old call fails this test immediately.
3. When the brand has no articles, neither the indexed read nor the global
   scan is called at all (matches the old ternary's `: []` branch).

Ran (not the full suite, per instructions):

```
npx vitest run tests/unit/geoOpportunitiesRankings.test.ts tests/unit/geoSignalRuns.test.ts tests/unit/geoSignalsAnalyzePersistence.test.ts
```

Output:

```
 Test Files  3 passed (3)
      Tests  9 passed (9)
```

All three files pass, including the two pre-existing geo-named suites
(unaffected by this change).

## Product question - not decided here

`/api/geo-analytics/:brandId` accepts `?since=<ISO>` and, when a citation
run is active, scopes rankings to that run's window - so during a fresh
run the numbers reflect only the new run's data, not diluted by months of
history.

`/api/geo-opportunities/:brandId` applies no window at all, before or
after this fix. It reports the brand's **entire history** of cited
rankings for the Reddit/own-site/third-party split, the per-platform
citation-share list, and `totalCitedRankings`.

Concretely, today: if a brand ran citation checks in January (mostly
uncited) and again this week (mostly cited, after content changes), the
Opportunities page mixes both runs into one citation-share breakdown and
one total. Adding the same `since` window GEO Analytics uses would drop
every ranking row older than the window's start from `keyStats`,
`totalCitedRankings`, and the per-platform `citationShare`/`citationCount`
figures - meaning a brand with strong historical citations but a currently
stalled run would suddenly show near-zero shares and few or no
content-idea-driving stats, while a brand's page would look sparser right
after a fresh run than it does today with full history.

Whether Opportunities should show "gaps in the current run" (consistent
with GEO Analytics, more actionable, but sparse/misleading for a brand
that hasn't run a fresh check recently) or "gaps across all-time history"
(consistent with its current behavior and richer content-idea signal, but
can look stale or contradict what GEO Analytics is showing for the same
brand at the same time) is a product decision about what users should see
on this page. I left the behavior unchanged - no `since` filter - and did
not decide this either way.
