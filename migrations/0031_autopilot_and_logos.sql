-- 0031_autopilot_and_logos.sql
-- Adds brand logo URL + autopilot run tracking columns, and a shared
-- competitor favicon cache keyed by domain. Idempotent: safe to re-run.

BEGIN;

ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS autopilot_status text DEFAULT 'idle';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS autopilot_step integer DEFAULT 0;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS autopilot_started_at timestamp;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS autopilot_completed_at timestamp;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS autopilot_error text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS autopilot_progress jsonb;

CREATE TABLE IF NOT EXISTS competitor_favicons (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  domain     text NOT NULL,
  icon_url   text,
  fetched_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS competitor_favicons_domain_idx
  ON competitor_favicons(domain);

COMMIT;
