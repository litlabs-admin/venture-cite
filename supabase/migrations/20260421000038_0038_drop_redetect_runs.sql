-- Source: migrations/0038_drop_redetect_runs.sql
-- SHA256: 34b0aa5bbd24639867d1dc584889761508a40da76cfc464c8f50e33cccee8f03

-- Remove invalid historical re-detect rows.
-- wrote to citation_runs. Re-detect re-evaluates existing responses and
-- doesn't issue any new AI calls - it has no business in the run history.
-- The re-detect-all route never writes a
-- row, so this migration is a one-time cleanup of historical rows only.
--
-- Safe because:
--   * triggered_by='re-detect' identifies re-detect rows and
--     never existed before, so we can't accidentally delete legitimate
--     manual / cron rows.
--   * geo_rankings rows reference citation_runs via run_id - the FK is
--     ON DELETE SET NULL (per migrations/0003_fk_hardening.sql), so the
--     rankings stay intact and just lose their (meaningless) re-detect
--     run reference.

DELETE FROM citation_runs WHERE triggered_by = 're-detect';
