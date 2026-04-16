-- Remove all publish-related state from articles. Articles are now a single
-- editable list with no draft/published distinction.

DROP INDEX IF EXISTS articles_status_idx;

ALTER TABLE articles DROP COLUMN IF EXISTS status;
ALTER TABLE articles DROP COLUMN IF EXISTS published_at;
ALTER TABLE articles DROP COLUMN IF EXISTS canonical_url;
