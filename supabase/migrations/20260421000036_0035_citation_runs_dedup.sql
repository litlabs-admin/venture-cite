-- Source: migrations/0035_citation_runs_dedup.sql
-- SHA256: dd31226de7970997bf654a4fbd97d4d61a409dcc3d8e205fbc7e9582fd0ae081

-- Prevent concurrent duplicate citation runs for one brand.
--
-- Without this, a user clicking "Run Check" from two tabs within the
-- 8-second poll window of useActiveCitationRuns can start two parallel
-- runs that interleave writes to geo_rankings - duplicating cost and
-- producing inconsistent aggregates. The button-disable on `hasActive`
-- is best-effort UX; this index is the real guard.

BEGIN;

-- Reconcile any pre-existing duplicates so the unique index can be created.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY brand_id ORDER BY started_at DESC) AS rn
  FROM citation_runs
  WHERE status IN ('pending', 'running')
)
UPDATE citation_runs
   SET status = 'failed',
       error_message = 'reconciled by dedup migration',
       completed_at = COALESCE(completed_at, NOW()),
       progress_pct = 100
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS citation_runs_one_active_per_brand
  ON citation_runs(brand_id)
  WHERE status IN ('pending', 'running');

COMMIT;
