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
