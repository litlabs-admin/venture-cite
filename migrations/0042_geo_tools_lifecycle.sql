-- Wave 9.4: GEO Tools content lifecycle, dedup at DB level, semantic FAQ
-- dedup, and self-citation tracking infrastructure.
--
-- (a) Enable pg_trgm for semantic FAQ dedup (best-effort; fallback to
--     exact-match in app code if the extension is unavailable).
-- (b) Collapse legacy duplicates per (brand, normalized url) keeping the
--     oldest row, then enforce uniqueness so concurrent scans can use
--     INSERT ... ON CONFLICT DO NOTHING.
-- (c) Add lifecycle columns: published_url, published_at, last_cited_at
--     on bofu_content + faq_items; outreach_status + last_verified_at on
--     listicles; status on brand_mentions.
-- (d) Add tracked_content_urls so the citation checker can detect when
--     the user's own published BOFU/FAQ pages get cited by AI platforms.
-- (e) Add citation_runs.self_citation_count aggregate.
-- (f) Trigram GIN index on faq_items.question (skipped silently if
--     pg_trgm is unavailable).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- (b) Dedupe legacy rows BEFORE adding unique indexes.
-- ============================================================

-- Listicles: collapse duplicates per (brand_id, lower(url)). Keep the
-- oldest row by created_at, then by id as a stable tiebreaker.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY brand_id, lower(url)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM listicles
)
DELETE FROM listicles WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Wikipedia mentions: collapse per (brand_id, page_url). page_url is
-- already exact-cased in practice (Wikipedia URLs are case-sensitive),
-- so straight equality is correct.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY brand_id, page_url
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM wikipedia_mentions
)
DELETE FROM wikipedia_mentions WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Brand mentions: collapse per (brand_id, lower(source_url)).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY brand_id, lower(source_url)
      ORDER BY discovered_at ASC, id ASC
    ) AS rn
  FROM brand_mentions
)
DELETE FROM brand_mentions WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ============================================================
-- (c) Lifecycle columns. All nullable / defaulted so the migration
--     is non-breaking for existing readers.
-- ============================================================

ALTER TABLE bofu_content
  ADD COLUMN IF NOT EXISTS published_url text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_cited_at timestamptz;

ALTER TABLE faq_items
  ADD COLUMN IF NOT EXISTS published_url text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_cited_at timestamptz;

ALTER TABLE listicles
  ADD COLUMN IF NOT EXISTS outreach_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS outreach_notes text,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE brand_mentions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';

-- ============================================================
-- (b cont.) Unique indexes to backstop the dedup contract.
-- Use functional indexes for case-insensitive url matching where the
-- platform-side url casing isn't normative (general web URLs are
-- case-insensitive in host but case-sensitive in path; we accept the
-- conservative case-insensitive collapse for dedup purposes).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS listicles_brand_id_url_uniq
  ON listicles (brand_id, lower(url));

CREATE UNIQUE INDEX IF NOT EXISTS wikipedia_mentions_brand_id_page_url_uniq
  ON wikipedia_mentions (brand_id, page_url);

CREATE UNIQUE INDEX IF NOT EXISTS brand_mentions_brand_id_source_url_uniq
  ON brand_mentions (brand_id, lower(source_url));

-- ============================================================
-- (d) tracked_content_urls — polymorphic registry of brand-owned
-- published URLs that the citation checker should match against.
-- ============================================================

CREATE TABLE IF NOT EXISTS tracked_content_urls (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('bofu', 'faq')),
  source_id varchar NOT NULL,
  url text NOT NULL,
  -- normalized_url = lower(host + path), strip trailing slash, strip
  -- "www.", strip query/fragment. Filled in by the application
  -- on insert; index is used by the citation checker.
  normalized_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracked_content_urls_brand_id_idx
  ON tracked_content_urls (brand_id);

CREATE INDEX IF NOT EXISTS tracked_content_urls_brand_id_normalized_url_idx
  ON tracked_content_urls (brand_id, normalized_url);

-- One row per (source_type, source_id). When the user changes
-- published_url on a piece of content, the application UPDATES the row
-- in place; clearing published_url DELETES it.
CREATE UNIQUE INDEX IF NOT EXISTS tracked_content_urls_source_uniq
  ON tracked_content_urls (source_type, source_id);

-- ============================================================
-- (e) citation_runs.self_citation_count — aggregate maintained by the
-- citation checker as it detects matches against tracked_content_urls.
-- ============================================================

ALTER TABLE citation_runs
  ADD COLUMN IF NOT EXISTS self_citation_count integer NOT NULL DEFAULT 0;

-- ============================================================
-- (f) Trigram index for FAQ semantic dedup. Wrapped in DO block so
-- the migration succeeds even on a Postgres without pg_trgm; the
-- application-side dedup helper has a fallback path.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS faq_items_question_trgm_idx
      ON faq_items USING gin (question gin_trgm_ops);
  ELSE
    RAISE NOTICE 'pg_trgm extension not available; skipping faq_items_question_trgm_idx';
  END IF;
END $$;
