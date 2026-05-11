-- One row per "Analyze GEO Signals" run. Powers the
-- `lastSignalsScanAt` input on the recommendations engine so rule #8
-- (`rerun-geo-signals`) stops firing on brands that have actually scanned.
CREATE TABLE IF NOT EXISTS geo_signal_runs (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  article_id    VARCHAR REFERENCES articles(id) ON DELETE SET NULL,
  ran_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  overall_score INTEGER,
  payload       JSONB
);

CREATE INDEX IF NOT EXISTS geo_signal_runs_brand_id_ran_at_idx
  ON geo_signal_runs(brand_id, ran_at DESC);
