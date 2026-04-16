-- Content drafts: multi-draft persistence for the content generation page.
-- Each draft stores the full form state (keywords, industry, type, etc.) and
-- is auto-saved on field change so users never lose work. A draft can be
-- linked to an in-progress generation job (job_id) and updated with the
-- finished article (generated_content, article_id) when the job completes.

CREATE TABLE IF NOT EXISTS content_drafts (
  id                   VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              VARCHAR NOT NULL,
  title                TEXT,
  keywords             TEXT NOT NULL DEFAULT '',
  industry             TEXT NOT NULL DEFAULT '',
  type                 TEXT NOT NULL DEFAULT 'article',
  brand_id             VARCHAR,
  target_customers     TEXT,
  geography            TEXT,
  content_style        TEXT DEFAULT 'b2c',
  generated_content    TEXT,
  article_id           VARCHAR REFERENCES articles(id) ON DELETE SET NULL,
  job_id               VARCHAR REFERENCES content_generation_jobs(id) ON DELETE SET NULL,
  human_score          INTEGER,
  passes_ai_detection  INTEGER DEFAULT NULL,  -- NULL = unchecked, 0 = fails, 1 = passes
  created_at           TIMESTAMP DEFAULT now() NOT NULL,
  updated_at           TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS content_drafts_user_id_idx ON content_drafts(user_id);
CREATE INDEX IF NOT EXISTS content_drafts_job_id_idx ON content_drafts(job_id);
