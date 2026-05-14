CREATE TABLE IF NOT EXISTS fact_scrape_logs (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              VARCHAR NOT NULL REFERENCES brand_fact_scrape_runs(id) ON DELETE CASCADE,
  source              TEXT NOT NULL
    CHECK (source IN ('static_pages','search_llm','user_enrich','aggregate','paste')),
  status              TEXT NOT NULL CHECK (status IN ('done','failed','skipped')),
  fact_count          INTEGER NOT NULL DEFAULT 0,
  latency_ms          INTEGER,
  provider_latency_ms INTEGER,
  error_kind          TEXT,
  diagnostics         JSONB,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fact_scrape_logs_run_id_idx
  ON fact_scrape_logs (run_id);
CREATE INDEX IF NOT EXISTS fact_scrape_logs_created_at_idx
  ON fact_scrape_logs (created_at);
