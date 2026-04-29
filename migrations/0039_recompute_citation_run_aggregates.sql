-- Wave 9.1: recompute citation_runs aggregates from geo_rankings.
--
-- The header on each History row reads citation_runs.total_cited /
-- total_checks (cached at finalize time), while the drill-down reads
-- geo_rankings live. When re-detect-all later flipped is_cited on stored
-- rankings, the inline re-aggregation either didn't run for some runs
-- (race?), didn't persist, or was bypassed for older data — leaving the
-- header showing e.g. "2/50" while the drill-down sums to "16/50". Same
-- effect on the trend chart, the dashboard, and the citation_rate column.
--
-- This migration is a one-shot reconciliation: every citation_runs row
-- gets its aggregates rebuilt from the source of truth.
--
-- Safe because:
--   * UPDATE…FROM joins on run_id and only updates matched rows, so runs
--     with no rankings (orphans / re-detect rows from earlier Wave 9
--     pass that 0038 should have already deleted) are untouched.
--   * total_cited as integer SUM(is_cited::int) — is_cited is stored as
--     0/1 already, but the cast is defensive against any boolean drift.
--   * platform_breakdown is a JSONB column we don't recompute here —
--     it's used by HistoryTab tooltip only and self-heals on the next
--     run finalize. Worth a follow-up if it diverges noticeably.

UPDATE citation_runs cr
   SET total_checks   = sub.total_checks,
       total_cited    = sub.total_cited,
       citation_rate  = CASE WHEN sub.total_checks > 0
                             THEN ROUND(100.0 * sub.total_cited / sub.total_checks)::int
                             ELSE 0 END
  FROM (
    SELECT run_id,
           COUNT(*)::int                            AS total_checks,
           COALESCE(SUM(is_cited::int), 0)::int     AS total_cited
      FROM geo_rankings
     WHERE run_id IS NOT NULL
     GROUP BY run_id
  ) sub
 WHERE cr.id = sub.run_id;
