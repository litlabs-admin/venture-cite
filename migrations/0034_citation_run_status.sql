-- 0034_citation_run_status.sql
--
-- Wave 8 (citation live updates).
--
-- Adds explicit lifecycle columns to citation_runs so the app can tell
-- "is a run in flight for this brand" without inferring it from
-- `completedAt is null`. Used by:
--   * GET /api/brands/:id/citation-runs/active        (polling status gate)
--   * GET /api/brands/:id/citation-events             (SSE stream)
--   * client/src/hooks/useCitationLiveRefresh.ts     (auto-refetch dependent queries)
--
-- Existing rows default to status='succeeded', progress_pct=100 so old
-- finished runs don't accidentally trigger live-update polling on first
-- boot after this migration applies.
--
-- The partial index makes the "is any run active?" check O(1) — it only
-- contains rows in non-terminal states, which is at most a handful per
-- brand at any moment.

BEGIN;

ALTER TABLE citation_runs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS progress_pct integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS error_message text;

DO $$ BEGIN
  ALTER TABLE citation_runs
    ADD CONSTRAINT citation_runs_status_check
      CHECK (status IN ('pending','running','succeeded','failed','partial','cancelled'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS citation_runs_brand_status_idx
  ON citation_runs(brand_id, status)
  WHERE status IN ('pending','running');

COMMIT;
