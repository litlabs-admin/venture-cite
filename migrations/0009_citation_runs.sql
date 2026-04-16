-- Citation run history — one row per manual or cron-triggered citation check.
-- Stores aggregate totals + per-platform breakdown so the trend chart renders
-- without re-aggregating every geo_rankings row.

CREATE TABLE IF NOT EXISTS citation_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  total_checks integer NOT NULL DEFAULT 0,
  total_cited integer NOT NULL DEFAULT 0,
  citation_rate integer NOT NULL DEFAULT 0,
  triggered_by text NOT NULL DEFAULT 'manual',
  started_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp,
  platform_breakdown jsonb
);

CREATE INDEX IF NOT EXISTS citation_runs_brand_id_idx ON citation_runs(brand_id);
CREATE INDEX IF NOT EXISTS citation_runs_started_at_idx ON citation_runs(started_at);

-- Add run_id FK to geo_rankings so individual results link back to their run.
ALTER TABLE geo_rankings ADD COLUMN IF NOT EXISTS run_id varchar REFERENCES citation_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS geo_rankings_run_id_idx ON geo_rankings(run_id);
