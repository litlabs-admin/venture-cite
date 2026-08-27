-- Source: migrations/0085_digest_stamp_and_geo_rankings_unique.sql
-- SHA256: 351350883787754de019781de632833bd5cffa76a337eaa12723430563b7b85a

-- 0085 - two independent hardening changes.

-- 1) Dedicated dedup stamp for the weekly DIGEST. It previously shared
--    last_weekly_report_sent_at with the Sunday visibility-report job, so
--    whichever fired first permanently suppressed the other. Nullable, no
--    backfill: a NULL stamp means "never sent", which is correct for the
--    first digest after this ships.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_weekly_digest_sent_at TIMESTAMP;

-- 2) geo_rankings: prevent duplicate (run_id, brand_prompt_id, ai_platform)
--    rows. The unlocked kickoff-inline run can race the cron drain and both
--    write the same cell; the run aggregate then double-counts, corrupting
--    total_checks / citation_rate. competitor_geo_rankings already has this
--    guard (migration 0027) - this brings the primary table in line.

--    Pre-dedup existing duplicates first (a unique index can't be created
--    while duplicates exist): keep the most-recently-checked row per triple.
--    Partial to rows where both keys are non-null (the FKs are ON DELETE SET
--    NULL, so detached legacy rows can have NULLs and are intentionally left
--    alone - NULLs are distinct under a unique index anyway).
DELETE FROM geo_rankings gr
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY run_id, brand_prompt_id, ai_platform
           ORDER BY checked_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM geo_rankings
  WHERE run_id IS NOT NULL AND brand_prompt_id IS NOT NULL
) dup
WHERE gr.id = dup.id AND dup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS geo_rankings_run_prompt_platform_uniq
  ON geo_rankings (run_id, brand_prompt_id, ai_platform)
  WHERE run_id IS NOT NULL AND brand_prompt_id IS NOT NULL;
