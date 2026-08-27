-- Source: migrations/0095_content_job_slice_tokens.sql
-- SHA256: 81f1b82168842d27f9bd104289afab9593483adaf4f43ffa2ac7fbaf0cd0b379

ALTER TABLE public.content_generation_jobs
  ADD COLUMN IF NOT EXISTS advance_token TEXT,
  ADD COLUMN IF NOT EXISTS advance_lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS content_generation_jobs_advanceable_idx
  ON public.content_generation_jobs (advance_lease_expires_at, created_at)
  WHERE status IN ('pending', 'running');
