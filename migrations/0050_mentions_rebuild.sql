-- 0050_mentions_rebuild.sql
-- Mentions rebuild: drop conflicting indexes, add new columns,
-- backfill, delete junk + ai:* rows, create new tables, disable RLS.
-- See docs/superpowers/specs/2026-05-05-mentions-rebuild-design.md §3.16.

BEGIN;

-- Pre-delete observability (visible in migration logs).
DO $$
DECLARE ai_count INT; junk_count INT;
BEGIN
  SELECT COUNT(*) INTO ai_count FROM brand_mentions WHERE platform LIKE 'ai:%';
  SELECT COUNT(*) INTO junk_count FROM brand_mentions
    WHERE platform IN ('reddit','hackernews','quora')
      AND (status = 'new' OR status IS NULL);
  RAISE NOTICE '[0050] pre-delete ai_rows=% junk_rows=%', ai_count, junk_count;
END $$;

-- Drop the two conflicting unique indexes (B16 in spec).
DROP INDEX IF EXISTS brand_mentions_dedup_idx;
DROP INDEX IF EXISTS brand_mentions_brand_id_source_url_uniq;

-- Add new columns (idempotent).
ALTER TABLE brand_mentions
  ADD COLUMN IF NOT EXISTS mention_location text DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS link_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamp,
  ADD COLUMN IF NOT EXISTS matched_variation text,
  ADD COLUMN IF NOT EXISTS matched_field text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'scanner',
  ADD COLUMN IF NOT EXISTS scanner_version smallint DEFAULT 2,
  ADD COLUMN IF NOT EXISTS sentiment_source text DEFAULT 'llm',
  ADD COLUMN IF NOT EXISTS engagement_normalized smallint;

-- Mark all pre-existing rows as legacy (scanner_version=1).
-- brand_mentions has 'discovered_at', not 'created_at'.
UPDATE brand_mentions SET scanner_version = 1
  WHERE discovered_at < '2026-05-05'::date;

-- Q7: AI-citation rows leave this table entirely.
DELETE FROM brand_mentions WHERE platform LIKE 'ai:%';

-- Q6 + Q17: delete untouched legacy junk; preserve user-curated rows.
DELETE FROM brand_mentions
WHERE platform IN ('reddit','hackernews','quora')
  AND (status = 'new' OR status IS NULL)
  AND scanner_version = 1;

-- Unified unique index for canonical-URL dedup.
CREATE UNIQUE INDEX IF NOT EXISTS brand_mentions_brand_canonical_url_uniq
  ON brand_mentions (brand_id, lower(source_url));

-- Composite filter indexes.
CREATE INDEX IF NOT EXISTS brand_mentions_brand_status_discovered_idx
  ON brand_mentions (brand_id, status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS brand_mentions_brand_sentiment_idx
  ON brand_mentions (brand_id, sentiment, discovered_at DESC);
CREATE INDEX IF NOT EXISTS brand_mentions_brand_platform_idx
  ON brand_mentions (brand_id, platform, discovered_at DESC);

-- App-level scoping only (CLAUDE.md).
ALTER TABLE brand_mentions DISABLE ROW LEVEL SECURITY;

-- Per-brand opt-in for daily auto-scans.
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS monitor_mentions boolean NOT NULL DEFAULT false;

-- New tables.
CREATE TABLE IF NOT EXISTS scan_jobs (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id      varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id       varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger       text NOT NULL,
  status        text NOT NULL DEFAULT 'queued',
  per_source    jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals        jsonb NOT NULL DEFAULT '{}'::jsonb,
  error         text,
  started_at    timestamp,
  completed_at  timestamp,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_jobs_brand_status_idx ON scan_jobs (brand_id, status);
CREATE INDEX IF NOT EXISTS scan_jobs_user_active_idx
  ON scan_jobs (user_id, status) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS scan_jobs_completed_at_idx
  ON scan_jobs (completed_at) WHERE status IN ('complete','failed');

CREATE TABLE IF NOT EXISTS source_health (
  brand_id        varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source          text NOT NULL,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_failure_at timestamp,
  last_failure_reason text,
  paused_until    timestamp,
  last_successful_scan_at timestamp,
  PRIMARY KEY (brand_id, source)
);

CREATE TABLE IF NOT EXISTS sentiment_cache (
  content_hash    text PRIMARY KEY,
  sentiment       text NOT NULL,
  sentiment_score numeric(3, 2) NOT NULL,
  cached_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sentiment_cache_cached_at_idx
  ON sentiment_cache (cached_at);

COMMIT;
