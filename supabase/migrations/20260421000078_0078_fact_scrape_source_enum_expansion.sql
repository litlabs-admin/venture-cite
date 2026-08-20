-- Source: migrations/0078_fact_scrape_source_enum_expansion.sql
-- SHA256: b30f68737565cf964a107bf28127b97d8f73e601ca25397dd2db38b688126f20

-- Phase 4 source-enum expansion.
--
-- The v2 pipeline introduced two NEW source kinds that have been
-- writing to fact_scrape_logs under the "search_llm" enum as a
-- temporary hack (see runFullScrape.ts comment "phase 4 will add a
-- dedicated 'wikidata' enum").
--
-- Without this migration:
--   - Wikidata-sourced events are mislabeled "search_llm" in
--     fact_scrape_logs, which corrupts the per-source aggregate that
--     drives weeklySummary metrics and the admin Inspector UI.
--   - Future "structured_data" (JSON-LD pre-pass) events have the
--     same problem if/when we start logging them separately.
--   - Any direct INSERT with source='wikidata' silently fails with
--     a CHECK violation 23514, leaving the pipeline thinking it
--     persisted a log row it never did.
--
-- This migration:
--   1. Drops and recreates the CHECK constraint on fact_scrape_logs
--      to include 'wikidata' and 'structured_data'.
--   2. Drops and recreates the CHECK constraint on fact_scrape_cache
--      to allow 'wikidata' alongside 'search_llm' (the cache key
--      space is shared with the future Wikidata cache).
--   3. Re-runs the migration 0077 back-fill with a more permissive
--      condition: any row whose source IN ('user', 'user_manual')
--      becomes user_overridden=TRUE regardless of accepted_at. The
--      previous WHERE clause missed user_manual rows that the user
--      created via direct API insertion (no accepted_at) but
--      logically should be protected from scrape overwrites.
--
-- All changes are idempotent.
--
-- 2026-05-28.

-- 1. fact_scrape_logs source CHECK expansion.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'fact_scrape_logs_source_check'
  ) THEN
    ALTER TABLE fact_scrape_logs DROP CONSTRAINT fact_scrape_logs_source_check;
  END IF;
END$$;

ALTER TABLE fact_scrape_logs
  ADD CONSTRAINT fact_scrape_logs_source_check
  CHECK (source IN (
    'static_pages',
    'search_llm',
    'user_enrich',
    'aggregate',
    'paste',
    'wikidata',
    'structured_data'
  ));

-- 2. fact_scrape_cache source CHECK expansion.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'fact_scrape_cache_source_check'
  ) THEN
    ALTER TABLE fact_scrape_cache DROP CONSTRAINT fact_scrape_cache_source_check;
  END IF;
END$$;

ALTER TABLE fact_scrape_cache
  ADD CONSTRAINT fact_scrape_cache_source_check
  CHECK (source IN ('search_llm', 'wikidata'));

-- 3. Re-run the 0077 back-fill with the broader user-source condition.
-- Any user-edited row deserves the protection regardless of whether
-- accepted_at is set. The earlier accepted_at predicate was a leftover
-- from the truth-table draft.
UPDATE brand_fact_sheet
  SET user_overridden = TRUE,
      verification_status = 'manual_only'
  WHERE source IN ('user', 'user_manual')
    AND user_overridden = FALSE;
