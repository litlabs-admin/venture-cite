-- One row per scrape run. Powers the new Brand Fact Sheet SSE + diff view.
-- Slice-resumable: `status='slice_pending'` rows are picked up by a cron tick
-- and advanced by waitUntil(advanceScrapeRun(...)) in subsequent slices.
CREATE TABLE IF NOT EXISTS brand_fact_scrape_runs (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','planning','fetching','extracting','completed','failed','timeout','slice_pending','cancelled')),
  triggered_by    TEXT NOT NULL
    CHECK (triggered_by IN ('welcome_confirm','brand_create','manual_rescrape','cron_refresh')),
  started_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMP,
  last_advance_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deadline_ms       BIGINT,
  pages_planned     INTEGER NOT NULL DEFAULT 0,
  pages_fetched     INTEGER NOT NULL DEFAULT 0,
  pages_failed      INTEGER NOT NULL DEFAULT 0,
  facts_extracted   INTEGER NOT NULL DEFAULT 0,
  facts_validated   INTEGER NOT NULL DEFAULT 0,
  facts_redacted    INTEGER NOT NULL DEFAULT 0,
  llm_cost_cents    INTEGER NOT NULL DEFAULT 0,
  llm_calls         INTEGER NOT NULL DEFAULT 0,
  llm_input_tokens  BIGINT  NOT NULL DEFAULT 0,
  llm_output_tokens BIGINT  NOT NULL DEFAULT 0,
  error_kind        TEXT,
  error_message     TEXT,
  plan              JSONB,
  progress          JSONB
);

CREATE INDEX IF NOT EXISTS brand_fact_scrape_runs_brand_started_idx
  ON brand_fact_scrape_runs (brand_id, started_at DESC);

CREATE INDEX IF NOT EXISTS brand_fact_scrape_runs_slice_pending_idx
  ON brand_fact_scrape_runs (last_advance_at)
  WHERE status = 'slice_pending';

-- One row per page the agent attempted in a run. Powers the per-page UI panel
-- + delta surface ("what changed since last run").
CREATE TABLE IF NOT EXISTS brand_fact_scrape_pages (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        VARCHAR NOT NULL REFERENCES brand_fact_scrape_runs(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','fetching','extracting','done','failed','skipped_robots','skipped_lang','skipped_spa')),
  fetched_at     TIMESTAMP,
  bytes          INTEGER,
  status_code    INTEGER,
  content_type   TEXT,
  lang           TEXT,
  fact_count     INTEGER NOT NULL DEFAULT 0,
  llm_cost_cents INTEGER NOT NULL DEFAULT 0,
  error_kind     TEXT,
  error_message  TEXT,
  excerpt        TEXT
);

CREATE INDEX IF NOT EXISTS brand_fact_scrape_pages_run_idx
  ON brand_fact_scrape_pages (run_id);
