-- Every brand the citation-check analyzer found in one response, not just
-- the tracked brand/competitors that already have their own rows. Backs the
-- prompt-detail page's "Top Answers" column with the full real list instead
-- of only whichever competitors happened to already be tracked.
ALTER TABLE public.geo_rankings
  ADD COLUMN IF NOT EXISTS mentioned_brands JSONB;
