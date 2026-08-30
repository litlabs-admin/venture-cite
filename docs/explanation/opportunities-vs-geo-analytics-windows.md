# Why geo-opportunities reports all time while geo-analytics scopes to a run window

`GET /api/geo-analytics/:brandId` and `GET /api/geo-opportunities/:brandId`
both read from the same `geo_rankings` rows for a brand. They deliberately
disagree about how much history to include. This is a confirmed product
decision (2026-08-29), not an inconsistency to fix.

## What each endpoint does

`/api/geo-analytics/:brandId` accepts an optional `?since=<ISO
timestamp>` query parameter and filters rankings to that window. The route's
own comment explains why: without a window, a citation run that just started
contributes a handful of new rows into a metric computed over months of
accumulated history, so the fresh run's numbers are statistically invisible.
The client sends `since` set to a fresh run's start time while that run is
active, and sends `since=all` (treated the same as omitting the parameter)
once no run is active — so the same endpoint serves both "how did this run
do" and "how has this brand done overall," depending on what the caller
asks for.

`/api/geo-opportunities/:brandId` applies no `since` bound at all. It always
reports against the brand's entire ranking history.

## Why not make them agree

Adding a `since` window to `geo-opportunities` would make the two endpoints
consistent with each other, at a real cost: it would drop every cited row
older than the window from the opportunity finder's key statistics and
per-platform breakdowns. A brand with no recent citation run — which,
outside of the hourly automatic cadence, describes most brands most of the
time — would see this page go sparse or empty, even though the brand has
months of citation history that the page could otherwise draw on.

Geo-analytics exists to answer "how is this specific run doing," a question
that is only meaningful relative to a bounded slice of time. Geo-opportunities
exists to answer "where are this brand's citation gaps," a question that
gets more useful, not less, the more history it can see. The same
underlying data serves two different questions, and windowing correctly for
one question would answer the other one worse.

## What this means for anyone touching either route

Do not add a `since` filter to `/api/geo-opportunities` to make it "match"
`/api/geo-analytics`, and do not remove the `since` filter from
`/api/geo-analytics` to make it "match" `/api/geo-opportunities`. Both
routes carry a comment recording this reasoning at the point in
`server/routes/analytics.ts` where the difference is easy to mistake for a
bug. If a future change needs both views to agree for a specific product
reason, that is a new decision to make deliberately, with its own tradeoff
recorded — not a defect to quietly patch.
