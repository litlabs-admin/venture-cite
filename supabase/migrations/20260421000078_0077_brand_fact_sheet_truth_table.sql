-- Source: migrations/0077_brand_fact_sheet_truth_table.sql
-- SHA256: b6714a72680b6c5322c7ae4355db6f1f5f70cefea968530c735d0d110e685e1a

-- Phase 4 truth-table columns on brand_fact_sheet.
--
-- The existing schema already supports MOST of what a truth-table
-- needs: dedup unique index, sources/alternatives in valuePayload
-- JSONB, disagreementCount counter, lastVerified timestamp. The
-- missing pieces are explicit user-override tracking and re-
-- verification scheduling.
--
-- Columns added:
--   user_overridden          - once true, no scrape can overwrite this
--                              row's factValue. The merge logic in
--                              persistFacts respects this flag.
--   verification_attempts    - count of re-verification attempts (used
--                              by the cron to back off on facts whose
--                              source URL repeatedly fails).
--   last_verification_at     - when the re-verification cron last
--                              processed this row (NULL = never re-
--                              verified after initial scrape).
--   verification_status      - one of: never, verified, drift_detected,
--                              source_unreachable, manual_only.
--
-- Backward compatibility:
--   - All new columns are nullable / have defaults
--   - Existing reads work unchanged
--   - The user_overridden flag is set to TRUE automatically for
--     any row where source IN ('user_manual', 'user') AND accepted_at
--     IS NOT NULL (back-fill below)
--
-- 2026-05-28.

ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS user_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_verification_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'never';

-- Constrain the verification_status values.
ALTER TABLE brand_fact_sheet
  DROP CONSTRAINT IF EXISTS brand_fact_sheet_verification_status_chk;
ALTER TABLE brand_fact_sheet
  ADD CONSTRAINT brand_fact_sheet_verification_status_chk
  CHECK (verification_status IN ('never', 'verified', 'drift_detected', 'source_unreachable', 'manual_only'));

-- Back-fill: any user-source row that's been accepted is by definition
-- user-overridden. This protects existing manual edits from being
-- silently overwritten by future scrapes.
UPDATE brand_fact_sheet
  SET user_overridden = TRUE,
      verification_status = 'manual_only'
  WHERE source IN ('user', 'user_manual')
    AND accepted_at IS NOT NULL
    AND user_overridden = FALSE;

-- Index for the re-verification cron's "stale facts" query: stale =
-- (last_verified < NOW() - 30 days) AND user_overridden = FALSE AND
-- is_active = 1. Partial index keeps it small.
CREATE INDEX IF NOT EXISTS brand_fact_sheet_stale_idx
  ON brand_fact_sheet (last_verified)
  WHERE user_overridden = FALSE AND is_active = 1;
