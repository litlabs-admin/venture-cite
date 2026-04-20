-- Promote richer fields from Phase 2 analytics tables onto Phase 1.
-- After this migration, brand_prompts + geo_rankings carry the dimensions
-- that prompt_portfolio and citation_quality were supposed to hold, so the
-- Phase 2 analytics tables become unused (their schemas remain for historical
-- rows).

ALTER TABLE brand_prompts
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global';

ALTER TABLE geo_rankings
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS authority_score INTEGER,
  ADD COLUMN IF NOT EXISTS relevance_score INTEGER;

ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS discovered_by TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS brand_prompts_funnel_stage_idx ON brand_prompts(funnel_stage);
CREATE INDEX IF NOT EXISTS geo_rankings_source_type_idx ON geo_rankings(source_type);
CREATE INDEX IF NOT EXISTS brand_fact_sheet_source_idx ON brand_fact_sheet(source);
