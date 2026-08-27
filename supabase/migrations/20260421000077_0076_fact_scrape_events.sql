-- Source: migrations/0076_fact_scrape_events.sql
-- SHA256: 8d87eb752ed179d6b0370896f18a3382990fcec914472534fa129b7140a51480

-- fact_scrape_events: per-step telemetry for the brand fact sheet pipeline.
--
-- Records one row per significant event during a scrape so an operator
-- can reconstruct exactly what happened on any given run without
-- reading logs or attaching a debugger. The inspector UI at
-- /admin/scrape/:runId reads this table.
--
-- Design choices:
--   - Wide JSONB `metadata` column: each step has its own shape (sitemap
--     probe vs LLM call vs page guard skip), and we don't want a new
--     migration every time we add a step. JSONB indexes can be added
--     later for specific query patterns.
--   - `step_name` is a string, not an enum: lets the writer module
--     introduce new steps without a schema change. The inspector groups
--     events by step_name client-side.
--   - `outcome` is normalized to one of {ok, skipped, failed} so summary
--     queries are cheap. The detail goes in `metadata`.
--   - 90-day retention. Events are debugging breadcrumbs; we don't need
--     them long-term. A nightly cron prunes rows older than 90 days.
--   - No FK to brand_fact_scrape_runs (intentional). We want events to
--     survive even if a run is hard-deleted during cleanup so we can
--     post-mortem a deleted run.

CREATE TABLE IF NOT EXISTS fact_scrape_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       VARCHAR NOT NULL,
  brand_id     VARCHAR NOT NULL,
  step_name    TEXT NOT NULL,
  outcome      TEXT NOT NULL DEFAULT 'ok',
  duration_ms  INTEGER,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraint: outcome must be one of the three normalized values.
ALTER TABLE fact_scrape_events
  ADD CONSTRAINT fact_scrape_events_outcome_chk
  CHECK (outcome IN ('ok', 'skipped', 'failed'));

-- Read pattern 1: inspector loads everything for a run in order.
CREATE INDEX IF NOT EXISTS fact_scrape_events_run_created_idx
  ON fact_scrape_events (run_id, created_at);

-- Read pattern 2: brand-level summary across runs (when did this brand's
-- last sitemap probe succeed? when did LLM calls last fail?).
CREATE INDEX IF NOT EXISTS fact_scrape_events_brand_step_idx
  ON fact_scrape_events (brand_id, step_name, created_at DESC);

-- Read pattern 3: cron retention prune.
CREATE INDEX IF NOT EXISTS fact_scrape_events_created_idx
  ON fact_scrape_events (created_at);

-- Read pattern 4: failed-step alerting (used by the dashboard
-- "scrape health" panel - counts failures in last N hours).
CREATE INDEX IF NOT EXISTS fact_scrape_events_outcome_created_idx
  ON fact_scrape_events (outcome, created_at DESC)
  WHERE outcome = 'failed';
