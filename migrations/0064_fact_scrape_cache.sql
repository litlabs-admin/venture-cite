CREATE TABLE IF NOT EXISTS fact_scrape_cache (
  cache_key   TEXT PRIMARY KEY,
  source      TEXT NOT NULL CHECK (source IN ('search_llm')),
  brand_id    VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  value_json  JSONB NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS fact_scrape_cache_brand_id_idx
  ON fact_scrape_cache (brand_id);
CREATE INDEX IF NOT EXISTS fact_scrape_cache_expires_at_idx
  ON fact_scrape_cache (expires_at);
