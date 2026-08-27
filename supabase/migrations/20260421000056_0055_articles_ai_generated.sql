-- Source: migrations/0055_articles_ai_generated.sql
-- SHA256: eea9adbf808bb70f134125f611a63de6dcebdb8f305a8de6169f4859525590d3

-- Add an AI-disclosure column on articles.
-- AI-generated articles previously carried no marker. This adds a flag the
-- worker sets to true when content generation completes, so the UI can
-- surface an "AI-generated" pill on article surfaces.

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every article with an associated content_generation_jobs row
-- was created by the AI pipeline. Manually-authored articles (POST
-- /api/articles with no job) stay false.
UPDATE articles
SET ai_generated = true
WHERE id IN (SELECT DISTINCT article_id FROM content_generation_jobs WHERE article_id IS NOT NULL);
