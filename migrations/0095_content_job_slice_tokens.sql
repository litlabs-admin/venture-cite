ALTER TABLE public.content_generation_jobs
  ADD COLUMN IF NOT EXISTS advance_token TEXT,
  ADD COLUMN IF NOT EXISTS advance_lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS content_generation_jobs_advanceable_idx
  ON public.content_generation_jobs (advance_lease_expires_at, created_at)
  WHERE status IN ('pending', 'running');
