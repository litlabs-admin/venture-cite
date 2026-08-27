-- Source: migrations/0061_brand_fact_scrape_runs_uniq_active.sql
-- SHA256: 0ccb403cb9fbc485d95cd2d2d951166288e0c7bd23f865ab05d3a3dece8244fd

-- Spec 2 §4.9: at most one active scrape run per brand. Closes a
-- double-click race in POST /api/brand-fact-sheet/runs where two
-- concurrent requests could both pass the read-then-write inflight
-- check and both insert a 'pending' row. The partial unique index
-- makes the second INSERT fail with 23505, which the route now
-- translates into 409 'already_running'.
CREATE UNIQUE INDEX IF NOT EXISTS brand_fact_scrape_runs_one_active_per_brand_idx
  ON brand_fact_scrape_runs (brand_id)
  WHERE status IN ('pending','planning','fetching','extracting','slice_pending');
