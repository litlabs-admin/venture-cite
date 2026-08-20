-- Source: migrations/0028_competitor_sentiment.sql
-- SHA256: e98d8731e6f85e07e49f8d9f9eaea6860157e8d280f3ae33e6ff972ed56390b0

-- Add a sentiment column to competitor_geo_rankings so the merged
-- response analyzer can persist sentiment derived from relevance alongside
-- rank/relevance on competitor citation rows (matches geo_rankings.sentiment).
--
-- Also add sentiment to geo_rankings if it doesn't already exist there - the
-- column is referenced by analytics.ts but has never been guaranteed by a
-- migration. Use IF NOT EXISTS so this is a no-op when it's already present.

ALTER TABLE competitor_geo_rankings
  ADD COLUMN IF NOT EXISTS sentiment text;

ALTER TABLE geo_rankings
  ADD COLUMN IF NOT EXISTS sentiment text;

CREATE INDEX IF NOT EXISTS cgr_sentiment_idx
  ON competitor_geo_rankings (sentiment)
  WHERE sentiment IS NOT NULL;
