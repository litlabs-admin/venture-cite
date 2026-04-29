-- Wave 9: ScheduleTab v2.
--
-- Adds:
--   * auto_citation_hour: integer 0..23 (UTC) — hour of the day the
--     scheduled run fires. Previously the cron just ran "today's runs"
--     once per day with no time-of-day control, which made it
--     impossible to predict when results would land.
--   * auto_citation_active: boolean — pauses the schedule without
--     losing the user's day/hour selection. Setting auto_citation_schedule
--     to 'off' previously did the same job but lost the prior day.
--   * last_auto_citation_status: text — succeeded | failed | partial.
--     Lets the UI render "Last run 3d ago — succeeded" vs "failed"
--     instead of just the timestamp.

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS auto_citation_hour integer NOT NULL DEFAULT 9
    CHECK (auto_citation_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS auto_citation_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_auto_citation_status text;
