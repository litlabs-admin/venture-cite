-- Source: migrations/0086_drop_prompt_portfolio_tables.sql
-- SHA256: d42d00223e0a77271b7dfe3a81946297ea4a5567221b6dadb48d4ab73ab92410

-- Drop the Phase 2 prompt_portfolio / prompt_test_runs tables. Both were
-- tombstones from an abandoned Phase 2 design (see docs/phase2_completion.md)
-- superseded by brand_prompts / geo_rankings, which the active citation
-- pipeline actually writes to. prompt_portfolio was always empty in
-- production; server/databaseStorage.ts synthesized Phase-1-shaped rows
-- from brand_prompts + geo_rankings instead of reading from it.
--
-- No remaining code path reads or writes either table as of this migration
-- (server/routes/intelligence.ts's /api/prompt-portfolio* and
-- /api/prompt-tests* handlers, the corresponding storage methods, and the
-- requirePromptPortfolio/requirePromptTest ownership helpers were removed
-- in the same change).
--
-- prompt_test_runs first: it FKs to prompt_portfolio via
-- prompt_test_runs.prompt_portfolio_id (ON DELETE SET NULL), so dropping
-- prompt_portfolio first would leave a dangling FK if CASCADE weren't used.
-- Order it correctly regardless of CASCADE so the intent reads right.

DROP TABLE IF EXISTS prompt_test_runs CASCADE;
DROP TABLE IF EXISTS prompt_portfolio CASCADE;
