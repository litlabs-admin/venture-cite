-- Source: migrations/0008_visibility_progress.sql
-- SHA256: bbfe2b76f3e7f037965b7f55a43e828473674ac55a228e839abee7b0b04b9c2c

-- Persist AI Visibility Checklist progress per (brand, engine, step) so it
-- survives device switches and browser clears.

CREATE TABLE IF NOT EXISTS visibility_progress (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  engine_id text NOT NULL,
  step_id text NOT NULL,
  completed_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visibility_progress_brand_id_idx ON visibility_progress(brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS visibility_progress_brand_engine_step_idx
  ON visibility_progress(brand_id, engine_id, step_id);
