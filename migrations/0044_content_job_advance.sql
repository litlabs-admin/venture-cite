-- Vercel migration: client-driven /advance for content generation.
--
-- The previous polling worker is replaced by a per-call slice that runs
-- for ~8s and persists progress. last_advance_started_at gates concurrent
-- /advance calls so two browser tabs (or a tab + a background tick)
-- don't double-stream into the same buffer.

ALTER TABLE content_generation_jobs
  ADD COLUMN IF NOT EXISTS last_advance_started_at TIMESTAMPTZ;
