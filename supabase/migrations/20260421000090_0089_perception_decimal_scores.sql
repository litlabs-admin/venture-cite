-- Source: migrations/0089_perception_decimal_scores.sql
-- SHA256: d0be6589521f18071b0a2e85f460bcd4b2377cc41a55c275d663e5b0afdca224

-- Brand perception axis scores need one decimal of precision.
--
-- WHY: the reference product reports scores like 66.6 / 65.8. The axis +
-- overall columns on brand_perception_runs (migration 0088) were INTEGER,
-- which silently rounds that precision away (66.6 -> 67) with no way to
-- recover it after the fact. Widening to numeric(4,1) preserves exactly the
-- one decimal digit the judge is asked to produce, while still comfortably
-- covering the 0-100 range (4 total digits = up to 999.9, so 100.0 fits).
--
-- Columns stay nullable - the honesty constraint from 0088 (an axis the
-- judge could not assess must read NULL, never a guessed 50) is unaffected
-- by the type change.
--
-- USING ROUND(col::numeric, 1) makes the ALTER idempotent-safe to rerun
-- against already-migrated (numeric) columns as well as the original
-- INTEGER columns.

ALTER TABLE public.brand_perception_runs
  ALTER COLUMN trust TYPE numeric(4, 1) USING ROUND(trust::numeric, 1),
  ALTER COLUMN quality TYPE numeric(4, 1) USING ROUND(quality::numeric, 1),
  ALTER COLUMN value TYPE numeric(4, 1) USING ROUND(value::numeric, 1),
  ALTER COLUMN market TYPE numeric(4, 1) USING ROUND(market::numeric, 1),
  ALTER COLUMN innovation TYPE numeric(4, 1) USING ROUND(innovation::numeric, 1),
  ALTER COLUMN overall TYPE numeric(4, 1) USING ROUND(overall::numeric, 1);
