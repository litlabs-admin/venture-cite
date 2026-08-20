-- Source: migrations/0047_geo_rankings_cited_urls.sql
-- SHA256: 8b05c2badc769b48b7573670a70bfaf501967f44f33ce998b347e7b495b8c5c5

-- Phase 3 (A3 citation locations): capture the list of URLs the LLM cited
-- in its response, in addition to the single citingOutletUrl that the
-- matcher pass derives. Many AI responses cite multiple URLs (footnote
-- style); previously we were dropping all but the first one.
--
-- TEXT[] is bounded application-side at 20 URLs per response (paranoid
-- cap - real responses cite 0–10).
--
-- Backward-compatible: column is nullable, existing rows stay null.
-- The UI guards with `result.citedUrls?.length > 0` so old rows render
-- without the new section.

ALTER TABLE geo_rankings ADD COLUMN IF NOT EXISTS cited_urls TEXT[];
