-- Tour engine event log. 90-day retention via daily cron in server/scheduler.ts.
-- See docs/superpowers/specs/2026-05-05-tour-engine-design.md.

CREATE TABLE IF NOT EXISTS tour_events (
  id              uuid PRIMARY KEY,                -- client-generated UUID for idempotency
  user_id         varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id        varchar NULL REFERENCES brands(id) ON DELETE SET NULL,
  tour_id         text NOT NULL,
  tour_version    integer NOT NULL,
  step_id         text NULL,
  step_index      integer NULL,
  event_type      text NOT NULL,
  trigger_type    text NULL,                       -- 'auto' | 'manual' | 'preview'
  dwell_ms        integer NULL,
  occurred_at     timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tour_events_tour_event_time_idx
  ON tour_events (tour_id, event_type, occurred_at);

CREATE INDEX IF NOT EXISTS tour_events_user_time_idx
  ON tour_events (user_id, occurred_at);

CREATE INDEX IF NOT EXISTS tour_events_retention_idx
  ON tour_events (occurred_at);
