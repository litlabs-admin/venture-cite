-- Drop dead columns on geo_signal_runs and schema_audits.
--
-- 2026-05-28 Signals page audit identified these as write-only:
--
--   geo_signal_runs.payload (jsonb): up to 32 KB per row, written on
--   every Analyze click, NEVER read. The Inspector / weeklySummary /
--   recommendations engine only read overallScore and ranAt.
--
--   schema_audits.additional_types (text[]): redundant — the same data
--   is duplicated inside schemas.additionalTypes (jsonb). Both write
--   paths populate it; the read path falls back to the jsonb copy
--   anyway, so dropping the sidecar array doesn't break any consumer.
--
-- We KEEP geo_signal_runs.overall_score (Phase 6: Pulse now reads it
-- to fire different recs for low-vs-high scores) and article_id
-- (useful FK for cross-feature pivots).
--
-- Both drops use IF EXISTS so re-running this is a no-op.
--
-- Migrations 0078 and 0079 expanded the source CHECK enum on
-- fact_scrape_logs and added the llm_jobs table; this 0080 closes
-- out the Signals retention cleanup that the new cron step
-- (signals-retention-prune) operationalises.

ALTER TABLE geo_signal_runs
  DROP COLUMN IF EXISTS payload;

ALTER TABLE schema_audits
  DROP COLUMN IF EXISTS additional_types;
