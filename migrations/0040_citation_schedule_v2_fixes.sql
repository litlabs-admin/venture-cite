-- Wave 9.2: fix two issues with Wave 9 schedule v2 + history aggregates.
--
-- (a) auto_citation_hour default was 9 (UTC), but the legacy auto-citation
--     cron fired at 06:00 UTC. Combined with the Wave 9 hour gate inside
--     isBrandDueForCitation (`currentHour >= autoCitationHour`), every
--     existing brand still on the migration default got silently skipped:
--     the cron fired at 06, 6 < 9 → skipped, and the cron didn't run again
--     until tomorrow's 06:00 (still skipped). They effectively never ran.
--     Backfill any row still at 9 to 0 (run as soon as the day matches).
--     Users who picked 9 explicitly via the Wave 9 ScheduleTab UI will be
--     rare; if they did, this migration will reset them. The new cron is
--     hourly (changed in server/scheduler.ts), so future hour picks all
--     the way to 23 actually fire.
--
-- (b) Recompute platform_breakdown JSONB for every citation_runs row.
--     Migration 0039 fixed total_checks/total_cited/citation_rate but
--     not the per-platform breakdown — HistoryTab tooltips still show
--     stale per-platform numbers on rows where re-detect later flipped
--     is_cited values. Rebuild from the source of truth (geo_rankings).

-- (a) Backfill auto_citation_hour for rows still at the migration default.
UPDATE brands
   SET auto_citation_hour = 0
 WHERE auto_citation_hour = 9;

-- (b) Rebuild platform_breakdown for every citation_runs row that has
--     any rankings. Idempotent: re-running produces the same JSONB.
WITH agg AS (
  SELECT
    run_id,
    ai_platform,
    COUNT(*)::int                            AS checks,
    COALESCE(SUM(is_cited::int), 0)::int     AS cited
  FROM geo_rankings
  WHERE run_id IS NOT NULL
  GROUP BY run_id, ai_platform
),
nested AS (
  SELECT
    run_id,
    jsonb_object_agg(
      ai_platform,
      jsonb_build_object(
        'cited',  cited,
        'checks', checks,
        'rate',   CASE WHEN checks > 0
                       THEN ROUND(100.0 * cited / checks)::int
                       ELSE 0 END
      )
    ) AS pb
  FROM agg
  GROUP BY run_id
)
UPDATE citation_runs cr
   SET platform_breakdown = nested.pb
  FROM nested
 WHERE cr.id = nested.run_id;
