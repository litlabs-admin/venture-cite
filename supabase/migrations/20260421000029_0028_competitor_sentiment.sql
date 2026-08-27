-- Source: migrations/0028_competitor_sentiment.sql
-- SHA256: 083ca07af492d557b7e17c95a871e391a07b81deab8b76c5b67f603d36d20310

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
