-- Per-brand monthly LLM-cost cap for fact scrapes. Default cap $5.00/month.
-- Row created lazily on first scrape of the month; not pre-seeded.
CREATE TABLE IF NOT EXISTS brand_monthly_cost_caps (
  brand_id          VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  month_key         TEXT NOT NULL,  -- format: YYYY-MM
  fact_scrape_cents INTEGER NOT NULL DEFAULT 0,
  monthly_cap_cents INTEGER NOT NULL DEFAULT 500,
  PRIMARY KEY (brand_id, month_key)
);

CREATE INDEX IF NOT EXISTS brand_monthly_cost_caps_month_idx
  ON brand_monthly_cost_caps (month_key);

-- Pause toggle: when false, manual + cron + welcome-path scrapes are all skipped.
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS fact_scrape_enabled BOOLEAN NOT NULL DEFAULT TRUE;
