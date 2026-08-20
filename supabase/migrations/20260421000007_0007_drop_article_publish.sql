-- Source: migrations/0007_drop_article_publish.sql
-- SHA256: 141174bb8eb0b9bec257b0a039319dbdc2ddc5710a7df751ba6b4d33db42c966

-- Remove all publish-related state from articles. Articles are now a single
-- editable list with no draft/published distinction.

DROP INDEX IF EXISTS articles_status_idx;

ALTER TABLE articles DROP COLUMN IF EXISTS status;
ALTER TABLE articles DROP COLUMN IF EXISTS published_at;
ALTER TABLE articles DROP COLUMN IF EXISTS canonical_url;
