-- Site health scan history: one row per COMPLETED fact-scrape run, so the
-- Optimize page's History tab can chart a real score trend instead of only
-- ever showing "now."
--
-- WHY A TABLE AND NOT ON-DEMAND COMPUTE: the score itself is cheap to
-- recompute, but the discovery/crawler probe results and the crawl's
-- pages/issues counts are NOT retained anywhere once a newer scrape run
-- supersedes the old one (brand_fact_scrape_pages is keyed to the LATEST
-- completed run only in every query that reads it). Without a snapshot
-- table there is no way to know what the score was last week - the
-- underlying inputs are gone by the time you'd want to ask.
--
-- HONESTY CONSTRAINTS BAKED INTO THE SHAPE (same posture as
-- brand_perception_runs, migration 0088):
--   * `score` is NULLABLE. A scan that could not be scored (no website, no
--     completed crawl) records NULL, never 0.
--   * One row per COMPLETED scan (hooked to the fact-scrape run's terminal
--     write), never one row per dashboard page load - a cache hit must
--     never fabricate a new history point.

CREATE TABLE IF NOT EXISTS public.site_health_scan_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- brand_fact_scrape_runs.id is VARCHAR (defaulted to a UUID-shaped
  -- string), not a native uuid column - matching the type here, not what
  -- would have been "cleaner", is what makes the FK constraint valid.
  run_id              VARCHAR REFERENCES public.brand_fact_scrape_runs(id) ON DELETE SET NULL,

  score               INTEGER,
  pages_crawled       INTEGER,
  pages_failed        INTEGER,

  issues_critical     INTEGER NOT NULL DEFAULT 0,
  issues_high         INTEGER NOT NULL DEFAULT 0,
  issues_medium       INTEGER NOT NULL DEFAULT 0,
  issues_low          INTEGER NOT NULL DEFAULT 0,

  -- Snapshots of the SiteHealth.discovery / crawlers objects at scan time -
  -- the same shape the API already returns, so History rows can be read
  -- with the exact same client-side types as the live tile.
  discovery           JSONB,
  crawlers            JSONB,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only two queries this table serves: "newest N scans for this brand"
-- (the trend chart + scan log) and "the two scans being compared" (by id,
-- covered by the primary key). One index covers the first.
CREATE INDEX IF NOT EXISTS site_health_scan_history_brand_created_idx
  ON public.site_health_scan_history (brand_id, created_at DESC);

-- Same posture as migration 0081/0088: RLS on, no policies. Written only by
-- the Express API over the Drizzle owner connection, which is not subject
-- to RLS; default-denies the anon/authenticated PostgREST roles.
ALTER TABLE public.site_health_scan_history ENABLE ROW LEVEL SECURITY;
