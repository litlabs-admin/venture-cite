-- Source: migrations/0090_monitor_mentions_default_on.sql
-- SHA256: 156913d5f2a2369a539e2687458ae3cfff3d665621e1d26c3d2cd6b3d01cc63a

-- Mention monitoring on by default.
--
-- `brands.monitor_mentions` gates the weekly mention-scan cron
-- (scheduler.ts -> listBrandsWithMentionMonitoring), and it defaulted to
-- FALSE. Every other dashboard measurement fires on its own schedule -
-- citations hourly, competitor discovery / listicles weekly - so mentions was
-- the single panel that stayed empty forever unless someone found the toggle.
-- Measured before this migration: 27 of 29 live brands had it off, and the
-- brands that DO have mention data got it from manual scans (67 completed
-- manual scan jobs vs 12 cron ones).
--
-- Scope: this changes the DEFAULT for newly created brands only. Existing
-- rows are deliberately NOT backfilled - flipping monitoring on for every
-- brand in the table would start outbound scanning and sentiment scoring for
-- accounts whose owners never asked for it. Turn them on individually from
-- Monitor › Mentions, or run the commented UPDATE below deliberately.

ALTER TABLE brands ALTER COLUMN monitor_mentions SET DEFAULT true;

-- Opt-in backfill - run by hand if you want every existing brand scanned:
-- UPDATE brands SET monitor_mentions = true WHERE deleted_at IS NULL;
