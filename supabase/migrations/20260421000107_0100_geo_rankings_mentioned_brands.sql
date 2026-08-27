-- Source: migrations/0100_geo_rankings_mentioned_brands.sql
-- SHA256: 709de12d86b6c58b26dfaf93d54c6ff820ac870a33a8e004e97abd711edf236f

-- Every brand the citation-check analyzer found in one response, not just
-- the tracked brand/competitors that already have their own rows. Backs the
-- prompt-detail page's "Top Answers" column with the full real list instead
-- of only whichever competitors happened to already be tracked.
ALTER TABLE public.geo_rankings
  ADD COLUMN IF NOT EXISTS mentioned_brands JSONB;
