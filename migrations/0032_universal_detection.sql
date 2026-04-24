-- 0032_universal_detection.sql
-- Foundation for the universal brand/competitor detection matcher.
--
-- 1) Competitors gain `name_variations` — the same dynamic variant list
--    brands already carry. Lets us run one shared matcher regardless of
--    whether the target is the user's brand or a tracked competitor.
--
-- 2) geo_rankings gains `re_detected_at` — a timestamp set when the
--    "Re-check stored" flow re-detects a citation using updated variants.
--    UI uses this to badge newly-revealed citations whose rank isn't
--    available (rank came from the original LLM pass).
--
-- Idempotent; safe to re-run.

BEGIN;

ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS name_variations text[] DEFAULT ARRAY[]::text[];

ALTER TABLE geo_rankings
  ADD COLUMN IF NOT EXISTS re_detected_at timestamp;

CREATE INDEX IF NOT EXISTS geo_rankings_re_detected_at_idx
  ON geo_rankings(re_detected_at)
  WHERE re_detected_at IS NOT NULL;

COMMIT;
