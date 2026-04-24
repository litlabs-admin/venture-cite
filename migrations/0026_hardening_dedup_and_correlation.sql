-- Wave 0: Hardening migration for Agent / Competitor / Hallucination features.
--
-- Adds:
--   * Unique indexes to close race windows in dedup logic (competitors,
--     competitor snapshots, hallucinations).
--   * Correlation columns so every downstream row traces to its source
--     (agent artifacts, hallucination → ranking, snapshot → run).
--   * Soft-delete + ignore tombstone for competitors.
--   * CHECK constraints to stop arbitrary status/severity strings.
--
-- Safe to run on production: preflight DELETE statements dedupe existing
-- rows before index creation so CREATE UNIQUE INDEX doesn't fail.

-- ────────────────────────────────────────────────────────────────────────
-- competitors: soft-delete, ignore flag, last-seen tracking
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS is_ignored INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP NULL;

-- Preflight dedup: keep oldest row per (brand_id, lower(name), lower(coalesce(domain,'')))
-- Merge snapshots onto the survivor before deleting losers.
WITH ranked AS (
  SELECT id, brand_id,
         ROW_NUMBER() OVER (
           PARTITION BY brand_id, lower(name), lower(coalesce(domain, ''))
           ORDER BY created_at ASC, id ASC
         ) AS rn,
         FIRST_VALUE(id) OVER (
           PARTITION BY brand_id, lower(name), lower(coalesce(domain, ''))
           ORDER BY created_at ASC, id ASC
         ) AS keep_id
  FROM competitors
)
UPDATE competitor_citation_snapshots cs
   SET competitor_id = r.keep_id
  FROM ranked r
 WHERE cs.competitor_id = r.id
   AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY brand_id, lower(name), lower(coalesce(domain, ''))
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM competitors
)
DELETE FROM competitors c
 USING ranked r
 WHERE c.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS competitors_brand_name_domain_idx
  ON competitors (brand_id, lower(name), lower(coalesce(domain, '')));

CREATE INDEX IF NOT EXISTS competitors_deleted_at_idx
  ON competitors (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- competitor_citation_snapshots: run correlation + idempotency key
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE competitor_citation_snapshots
  ADD COLUMN IF NOT EXISTS run_id VARCHAR NULL REFERENCES citation_runs(id) ON DELETE CASCADE;

-- Preflight dedup on (competitor_id, ai_platform, snapshot_date::date) for legacy
-- rows without run_id. We keep the most recent count per day.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY competitor_id, ai_platform, (snapshot_date::date)
           ORDER BY snapshot_date DESC, id DESC
         ) AS rn
  FROM competitor_citation_snapshots
  WHERE run_id IS NULL
)
DELETE FROM competitor_citation_snapshots cs
 USING ranked r
 WHERE cs.id = r.id
   AND r.rn > 1;

-- Unique per run (for new rows). Legacy rows with run_id NULL are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS cc_snapshots_competitor_platform_run_idx
  ON competitor_citation_snapshots (competitor_id, ai_platform, run_id)
  WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cc_snapshots_run_id_idx
  ON competitor_citation_snapshots (run_id)
  WHERE run_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- brand_hallucinations: source traceback + dedup index + severity enum
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE brand_hallucinations
  ADD COLUMN IF NOT EXISTS ranking_id VARCHAR NULL REFERENCES geo_rankings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS citing_outlet_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS citation_context TEXT NULL,
  ADD COLUMN IF NOT EXISTS article_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS seen_count INTEGER NOT NULL DEFAULT 1;

-- Preflight dedup on (brand_id, ai_platform, md5(claimed_statement)).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY brand_id, ai_platform, md5(claimed_statement)
           ORDER BY detected_at ASC, id ASC
         ) AS rn,
         COUNT(*) OVER (
           PARTITION BY brand_id, ai_platform, md5(claimed_statement)
         ) AS cnt,
         FIRST_VALUE(id) OVER (
           PARTITION BY brand_id, ai_platform, md5(claimed_statement)
           ORDER BY detected_at ASC, id ASC
         ) AS keep_id
  FROM brand_hallucinations
)
UPDATE brand_hallucinations b
   SET seen_count = r.cnt
  FROM ranked r
 WHERE b.id = r.keep_id
   AND r.cnt > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY brand_id, ai_platform, md5(claimed_statement)
           ORDER BY detected_at ASC, id ASC
         ) AS rn
  FROM brand_hallucinations
)
DELETE FROM brand_hallucinations b
 USING ranked r
 WHERE b.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS brand_hallucinations_dedup_idx
  ON brand_hallucinations (brand_id, ai_platform, md5(claimed_statement));

CREATE INDEX IF NOT EXISTS brand_hallucinations_ranking_id_idx
  ON brand_hallucinations (ranking_id)
  WHERE ranking_id IS NOT NULL;

-- Severity + remediation_status enum guards. Drop existing CHECK constraints
-- if re-running (defensive).
ALTER TABLE brand_hallucinations
  DROP CONSTRAINT IF EXISTS brand_hallucinations_severity_check;
ALTER TABLE brand_hallucinations
  ADD CONSTRAINT brand_hallucinations_severity_check
  CHECK (severity IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE brand_hallucinations
  DROP CONSTRAINT IF EXISTS brand_hallucinations_remediation_status_check;
ALTER TABLE brand_hallucinations
  ADD CONSTRAINT brand_hallucinations_remediation_status_check
  CHECK (remediation_status IS NULL OR remediation_status IN (
    'pending', 'in_progress', 'resolved', 'dismissed', 'verified'
  ));

-- ────────────────────────────────────────────────────────────────────────
-- agent_tasks: artifact correlation + status enum guard
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS artifact_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS artifact_id VARCHAR NULL;

CREATE INDEX IF NOT EXISTS agent_tasks_artifact_idx
  ON agent_tasks (artifact_type, artifact_id)
  WHERE artifact_id IS NOT NULL;

ALTER TABLE agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_status_check;
ALTER TABLE agent_tasks
  ADD CONSTRAINT agent_tasks_status_check
  CHECK (status IN ('queued', 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled'));

ALTER TABLE agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_artifact_type_check;
ALTER TABLE agent_tasks
  ADD CONSTRAINT agent_tasks_artifact_type_check
  CHECK (artifact_type IS NULL OR artifact_type IN (
    'content_job', 'citation_run', 'outreach_email', 'hallucination', 'source_analysis'
  ));
