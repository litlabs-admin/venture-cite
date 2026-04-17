-- Add `status` column to brand_prompts so suggestions and tracked prompts
-- can coexist in the same table. Keeps `is_active` around for a grace
-- period but new code should prefer `status`.
ALTER TABLE brand_prompts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'tracked';

UPDATE brand_prompts SET status = 'archived' WHERE is_active = 0;
UPDATE brand_prompts SET status = 'tracked' WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS brand_prompts_brand_status_idx
  ON brand_prompts(brand_id, status);
