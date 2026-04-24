-- 0030_schema_audits_and_article_version.sql
-- Adds the schema_audits cache table (keyed by sha256(url).slice(0,32))
-- and ensures articles.version exists for optimistic-lock applies.
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_audits (
  id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  url_hash              text NOT NULL,
  url                   text NOT NULL,
  schemas               jsonb NOT NULL,
  additional_types      text[],
  completeness_by_type  jsonb,
  fetched_at            timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS schema_audits_url_hash_idx
  ON schema_audits(url_hash);

-- articles.version already added in 0022_optimistic_lock_version.sql;
-- guarded here for safety on fresh environments.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

COMMIT;
