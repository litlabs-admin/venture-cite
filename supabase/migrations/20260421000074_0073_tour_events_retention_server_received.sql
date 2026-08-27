-- Source: migrations/0073_tour_events_retention_server_received.sql
-- SHA256: 4bdf050c81c10af74abf5cd8b4a38e94fd678fcaea357791ee0967f832c01106

-- Retention now deletes by server_received_at (trusted server clock)
-- instead of occurred_at (client-influenced). Index that column so the
-- daily cleanup DELETE in server/scheduler.ts stays index-supported.
-- See server/databaseStorage.ts deleteOldTourEvents + server/lib/tourCleanup.ts.

CREATE INDEX IF NOT EXISTS tour_events_server_received_retention_idx
  ON tour_events (server_received_at);
