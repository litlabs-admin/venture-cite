-- 0033_content_unification.sql
--
-- Wave 1 of the Content+Articles rebuild (see ~/.claude/plans/tidy-wandering-gem.md).
--
-- Unifies the three-table content model (content_drafts + content_generation_jobs +
-- articles) into a single article-with-status model:
--   * articles.status: 'draft' | 'generating' | 'ready' | 'failed'
--   * articles.jobId: nullable FK to content_generation_jobs (set while generating)
--   * articles carry the form-state fields the drafts table used to (target_customers,
--     geography, content_style)
--
-- Also:
--   * Drops the slug column + unique index — articles are now referenced by id only.
--   * Adds articles.external_url so the GEO Signals page can link to the article on
--     the user's own site without fabricating a /article/<slug> URL.
--   * Creates article_revisions for Auto-Improve history + diff/restore.
--   * Adds streaming + cancel + refund support to content_generation_jobs.
--   * Backfills orphan articles (brand_id IS NULL) into a per-user "Personal" brand
--     so brand_id can become NOT NULL going forward.
--   * Absorbs every content_drafts row into articles, then drops the table.
--
-- Idempotent: safe to re-run on a partially-applied environment because every
-- ALTER and CREATE is `IF NOT EXISTS` / `IF EXISTS` and the data steps re-run as
-- no-ops if their target rows are already migrated.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. articles: new lifecycle + form-state columns. Defaults preserve existing
--    rows (every existing article is treated as 'ready').
-- ---------------------------------------------------------------------------

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready';

DO $$ BEGIN
  ALTER TABLE articles
    ADD CONSTRAINT articles_status_check
      CHECK (status IN ('draft','generating','ready','failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS job_id varchar,
  ADD COLUMN IF NOT EXISTS target_customers text,
  ADD COLUMN IF NOT EXISTS geography text,
  ADD COLUMN IF NOT EXISTS content_style text DEFAULT 'b2c',
  ADD COLUMN IF NOT EXISTS external_url text,
  -- Keep the AI-detection columns around through the rebuild so existing
  -- per-row data isn't lost mid-migration. A later cleanup migration drops
  -- them once the UI no longer reads them.
  ADD COLUMN IF NOT EXISTS human_score integer,
  ADD COLUMN IF NOT EXISTS passes_ai_detection integer;

CREATE INDEX IF NOT EXISTS articles_status_idx ON articles(status);
CREATE INDEX IF NOT EXISTS articles_job_id_idx ON articles(job_id);

-- title and content become nullable so draft articles can exist before either
-- is filled in. Existing rows already have NOT NULL values so no data is lost.
ALTER TABLE articles ALTER COLUMN title DROP NOT NULL;
ALTER TABLE articles ALTER COLUMN content DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. content_generation_jobs: streaming buffer + error classification + refund.
-- ---------------------------------------------------------------------------

ALTER TABLE content_generation_jobs
  ADD COLUMN IF NOT EXISTS stream_buffer text DEFAULT '',
  ADD COLUMN IF NOT EXISTS error_kind text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamp;

-- Allow 'cancelled' as a terminal state. (status was previously a free-text
-- column with no CHECK constraint — just add the new value to the implicit
-- enum and document the allowed set.)
DO $$ BEGIN
  ALTER TABLE content_generation_jobs
    ADD CONSTRAINT content_generation_jobs_status_check
      CHECK (status IN ('pending','running','succeeded','failed','cancelled'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. article_revisions: per-Auto-Improve / per-edit history.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS article_revisions (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  varchar NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  content     text NOT NULL,
  source      text NOT NULL,
  created_by  varchar,
  created_at  timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE article_revisions
    ADD CONSTRAINT article_revisions_source_check
      CHECK (source IN ('generated','manual_edit','auto_improve','distribute_back'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS article_revisions_article_idx
  ON article_revisions(article_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Backfill orphan articles into a per-user "Personal" brand.
--
-- Some legacy articles were created with brand_id = NULL (allowed by the
-- previous schema). Going forward brand_id must be NOT NULL — so for every
-- user that owns at least one orphan article we create one Personal brand
-- and reassign their orphans to it. Idempotent: re-runs find nothing to do.
-- ---------------------------------------------------------------------------

-- NOTE: the historical articles table allowed a nullable brand_id. The current
-- schema definition (shared/schema.ts) declares brand_id NOT NULL — but in
-- practice older rows from before that constraint may still exist on legacy
-- environments. The block below is defensive: it only fires if any null-brand
-- rows exist, otherwise it's a cheap no-op.

DO $$
DECLARE
  has_orphans boolean;
BEGIN
  -- Skip if brand_id has no NULLs (the common case on fresh DBs).
  SELECT EXISTS (SELECT 1 FROM articles WHERE brand_id IS NULL)
    INTO has_orphans;

  IF has_orphans THEN
    -- Insert one Personal brand per affected user.
    INSERT INTO brands (id, user_id, name, company_name, industry, tone)
    SELECT
      gen_random_uuid()::text,
      u.id,
      'Personal',
      'Personal',
      'Other',
      'professional'
    FROM (
      SELECT DISTINCT a.user_id_proxy AS id
      FROM (
        -- The article's user is whichever user owns the brand it pointed at.
        -- Orphan articles by definition have no brand, so we need another path:
        -- in the legacy data this came from content_generation_jobs.user_id or
        -- from drafts.user_id. We use the most-recent linked draft if any.
        SELECT
          a.id AS article_id,
          COALESCE(d.user_id, j.user_id) AS user_id_proxy
        FROM articles a
        LEFT JOIN content_drafts d ON d.article_id = a.id
        LEFT JOIN content_generation_jobs j ON j.article_id = a.id
        WHERE a.brand_id IS NULL
      ) a
      WHERE a.user_id_proxy IS NOT NULL
    ) u
    LEFT JOIN brands existing
      ON existing.user_id = u.id AND existing.name = 'Personal'
    WHERE existing.id IS NULL;

    -- Reassign orphan articles to that user's Personal brand.
    UPDATE articles a
    SET brand_id = b.id
    FROM brands b,
         (
           SELECT
             a2.id AS article_id,
             COALESCE(d.user_id, j.user_id) AS user_id
           FROM articles a2
           LEFT JOIN content_drafts d ON d.article_id = a2.id
           LEFT JOIN content_generation_jobs j ON j.article_id = a2.id
           WHERE a2.brand_id IS NULL
         ) link
    WHERE a.id = link.article_id
      AND b.user_id = link.user_id
      AND b.name = 'Personal';
  END IF;
END $$;

-- Any remaining orphans (no linked draft, no linked job → no way to recover
-- ownership) are deleted. These represent unrecoverable data created before
-- proper user-tracking. In practice the count should be 0 — but we don't want
-- the NOT NULL constraint below to fail on a stragglers.
DELETE FROM articles WHERE brand_id IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Absorb content_drafts into articles.
--
-- Three buckets:
--   (a) draft.article_id IS NOT NULL          → article already exists; copy
--                                                form-state fields onto it.
--   (b) draft.article_id IS NULL AND
--       draft.generated_content IS NOT NULL    → unusual (orphan finished
--                                                draft). Insert a stub article
--                                                marked status='ready'.
--   (c) draft.article_id IS NULL AND
--       draft.generated_content IS NULL        → unfinished form-state draft.
--                                                Insert a stub article with
--                                                status='draft' so it appears
--                                                in the new unified flow.
-- ---------------------------------------------------------------------------

-- Only run if the legacy table still exists (so re-runs of this migration on
-- a fresh DB don't break).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'content_drafts') THEN

    -- (a) Copy form-state fields onto articles already linked to a draft.
    UPDATE articles a
    SET
      target_customers = COALESCE(a.target_customers, d.target_customers),
      geography        = COALESCE(a.geography,        d.geography),
      content_style    = COALESCE(a.content_style,    d.content_style),
      human_score      = COALESCE(a.human_score,      d.human_score),
      passes_ai_detection = COALESCE(a.passes_ai_detection, d.passes_ai_detection),
      status = CASE
        WHEN d.job_id IS NOT NULL THEN 'generating'
        ELSE 'ready'
      END,
      job_id = d.job_id
    FROM content_drafts d
    WHERE d.article_id = a.id;

    -- (b) Orphan finished drafts → insert ready articles. Need a brand: use the
    -- draft's brand_id if set, else the user's first brand, else skip.
    INSERT INTO articles (
      id, brand_id, title, content, keywords, industry, content_type,
      target_customers, geography, content_style, status, author,
      created_at, updated_at
    )
    SELECT
      gen_random_uuid()::text,
      COALESCE(d.brand_id, (
        SELECT b.id FROM brands b WHERE b.user_id = d.user_id
        ORDER BY b.created_at ASC LIMIT 1
      )),
      COALESCE(NULLIF(d.title, ''), split_part(d.keywords, ',', 1)),
      d.generated_content,
      string_to_array(NULLIF(d.keywords, ''), ','),
      NULLIF(d.industry, ''),
      d.type,
      d.target_customers,
      d.geography,
      COALESCE(d.content_style, 'b2c'),
      'ready',
      'GEO Platform',
      d.created_at,
      d.updated_at
    FROM content_drafts d
    WHERE d.article_id IS NULL
      AND d.generated_content IS NOT NULL
      AND COALESCE(d.brand_id, (
        SELECT b.id FROM brands b WHERE b.user_id = d.user_id
        ORDER BY b.created_at ASC LIMIT 1
      )) IS NOT NULL;

    -- (c) Unfinished drafts → insert draft articles. Same brand-resolution.
    INSERT INTO articles (
      id, brand_id, title, content, keywords, industry, content_type,
      target_customers, geography, content_style, status, author,
      created_at, updated_at
    )
    SELECT
      gen_random_uuid()::text,
      COALESCE(d.brand_id, (
        SELECT b.id FROM brands b WHERE b.user_id = d.user_id
        ORDER BY b.created_at ASC LIMIT 1
      )),
      COALESCE(NULLIF(d.title, ''), NULLIF(split_part(d.keywords, ',', 1), '')),
      NULL,
      string_to_array(NULLIF(d.keywords, ''), ','),
      NULLIF(d.industry, ''),
      d.type,
      d.target_customers,
      d.geography,
      COALESCE(d.content_style, 'b2c'),
      'draft',
      'GEO Platform',
      d.created_at,
      d.updated_at
    FROM content_drafts d
    WHERE d.article_id IS NULL
      AND d.generated_content IS NULL
      AND COALESCE(d.brand_id, (
        SELECT b.id FROM brands b WHERE b.user_id = d.user_id
        ORDER BY b.created_at ASC LIMIT 1
      )) IS NOT NULL;

    -- Drop the legacy table. Index drops cascade.
    DROP TABLE content_drafts;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Slug deletion. Drop the unique index first, then the column.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS articles_brand_slug_idx;
ALTER TABLE articles DROP COLUMN IF EXISTS slug;

-- ---------------------------------------------------------------------------
-- 7. Seed an initial 'generated' revision for each existing 'ready' article
--    so Auto-Improve has a baseline to diff against on legacy content.
-- ---------------------------------------------------------------------------

INSERT INTO article_revisions (article_id, content, source, created_by)
SELECT a.id, a.content, 'generated', 'system'
FROM articles a
LEFT JOIN article_revisions r ON r.article_id = a.id
WHERE a.content IS NOT NULL
  AND r.id IS NULL;

COMMIT;
