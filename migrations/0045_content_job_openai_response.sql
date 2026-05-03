-- Vercel migration: OpenAI Responses API (background mode) for content
-- generation. The response runs on OpenAI's servers; we store the ID and
-- poll openai.responses.retrieve() to check status. Decouples generation
-- length from our 60s function ceiling.
--
-- Existing in-flight jobs (status='pending'|'running' with stream_buffer
-- already populated) cannot be cleanly resumed in the new model — they
-- have no response_id to retrieve. The slice runner detects them via
-- (openai_response_id IS NULL AND length(stream_buffer) > 0) and marks
-- them failed so users get a clean retry.

ALTER TABLE content_generation_jobs
  ADD COLUMN IF NOT EXISTS openai_response_id TEXT;
