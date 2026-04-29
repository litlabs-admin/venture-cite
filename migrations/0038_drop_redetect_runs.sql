-- Wave 9.1: clean up the bogus re-detect rows that an earlier Wave 9 pass
-- wrote to citation_runs. Re-detect re-evaluates existing responses and
-- doesn't issue any new AI calls — it has no business in the run history.
-- Going forward (post-Wave 9.1), the re-detect-all route never writes a
-- row, so this migration is a one-time cleanup of historical rows only.
--
-- Safe because:
--   * triggered_by='re-detect' is the new value introduced in Wave 9 and
--     never existed before, so we can't accidentally delete legitimate
--     manual / cron rows.
--   * geo_rankings rows reference citation_runs via run_id — the FK is
--     ON DELETE SET NULL (per migrations/0003_fk_hardening.sql), so the
--     rankings stay intact and just lose their (meaningless) re-detect
--     run reference.

DELETE FROM citation_runs WHERE triggered_by = 're-detect';
