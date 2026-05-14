-- Spec 2 §5.1: additive schema migration on brand_fact_sheet.
-- Rename fact_category → subcategory (now LLM-picked, free-form).
-- Add 8 columns for the new taxonomy + valueType + provenance.
-- Backfill domain from old fact_category values, then backfill user-typed
-- onboarding answers as source='user' rows.

-- Add the new domain enum column (defaults to 'identity' so existing rows are valid)
ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'identity';

-- Constraint applied after default so existing rows pass
ALTER TABLE brand_fact_sheet
  DROP CONSTRAINT IF EXISTS brand_fact_sheet_domain_chk;
ALTER TABLE brand_fact_sheet
  ADD CONSTRAINT brand_fact_sheet_domain_chk
  CHECK (domain IN ('identity','offerings','positioning','team','operations','credentials','growth','contact'));

-- Rename fact_category → subcategory (idempotent: check before renaming)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brand_fact_sheet' AND column_name = 'fact_category'
  ) THEN
    ALTER TABLE brand_fact_sheet RENAME COLUMN fact_category TO subcategory;
  END IF;
END $$;

-- Backfill domain from the old fact_category values (now subcategory)
UPDATE brand_fact_sheet SET domain = CASE
  WHEN subcategory IN ('founding','funding','achievements') THEN 'growth'
  WHEN subcategory = 'team'                                  THEN 'team'
  WHEN subcategory IN ('products','pricing')                 THEN 'offerings'
  WHEN subcategory = 'locations'                             THEN 'operations'
  ELSE 'identity'
END
WHERE domain = 'identity' AND subcategory IS NOT NULL;

-- valueType discriminated union (string | number | array)
ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS value_type TEXT NOT NULL DEFAULT 'string';
ALTER TABLE brand_fact_sheet
  DROP CONSTRAINT IF EXISTS brand_fact_sheet_value_type_chk;
ALTER TABLE brand_fact_sheet
  ADD CONSTRAINT brand_fact_sheet_value_type_chk
  CHECK (value_type IN ('string','number','array'));

ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS value_payload  JSONB,
  ADD COLUMN IF NOT EXISTS confidence     NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS source_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS dismissed_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS accepted_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS run_id         VARCHAR REFERENCES brand_fact_scrape_runs(id) ON DELETE SET NULL;

ALTER TABLE brand_fact_sheet
  DROP CONSTRAINT IF EXISTS brand_fact_sheet_confidence_chk;
ALTER TABLE brand_fact_sheet
  ADD CONSTRAINT brand_fact_sheet_confidence_chk
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

-- Unique partial indexes: one active row per (brand, domain, subcategory, factKey) per source.
-- WHERE dismissed_at IS NULL keeps history but only one "live" row per tuple per source.
CREATE UNIQUE INDEX IF NOT EXISTS brand_fact_sheet_brand_tuple_scraped_idx
  ON brand_fact_sheet (brand_id, domain, subcategory, fact_key)
  WHERE source = 'scraped' AND dismissed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brand_fact_sheet_brand_tuple_user_idx
  ON brand_fact_sheet (brand_id, domain, subcategory, fact_key)
  WHERE source = 'user' AND dismissed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brand_fact_sheet_brand_tuple_manual_idx
  ON brand_fact_sheet (brand_id, domain, subcategory, fact_key)
  WHERE source = 'manual' AND dismissed_at IS NULL;

-- Backfill user-typed onboarding answers as source='user' rows.
-- ON CONFLICT DO NOTHING so re-running the migration is safe.

-- brands.description → identity > description > primary
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, source, source_url, last_verified)
SELECT id, 'identity', 'description', 'primary', description, 'string', 'user', NULL, NOW()
FROM brands
WHERE description IS NOT NULL AND description != ''
ON CONFLICT DO NOTHING;

-- brands.target_audience → positioning > target_audience > primary
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, source, source_url, last_verified)
SELECT id, 'positioning', 'target_audience', 'primary', target_audience, 'string', 'user', NULL, NOW()
FROM brands
WHERE target_audience IS NOT NULL AND target_audience != ''
ON CONFLICT DO NOTHING;

-- brands.brand_voice → positioning > brand_voice > primary
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, source, source_url, last_verified)
SELECT id, 'positioning', 'brand_voice', 'primary', brand_voice, 'string', 'user', NULL, NOW()
FROM brands
WHERE brand_voice IS NOT NULL AND brand_voice != ''
ON CONFLICT DO NOTHING;

-- brands.products[] → offerings > products > primary (valueType='array')
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, value_payload, source, source_url, last_verified)
SELECT id,
       'offerings',
       'products',
       'primary',
       array_to_string(products, ', '),
       'array',
       jsonb_build_object('items', to_jsonb(products)),
       'user',
       NULL,
       NOW()
FROM brands
WHERE products IS NOT NULL AND array_length(products, 1) > 0
ON CONFLICT DO NOTHING;

-- brands.key_values[] → positioning > key_values > primary (valueType='array')
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, value_payload, source, source_url, last_verified)
SELECT id,
       'positioning',
       'key_values',
       'primary',
       array_to_string(key_values, ', '),
       'array',
       jsonb_build_object('items', to_jsonb(key_values)),
       'user',
       NULL,
       NOW()
FROM brands
WHERE key_values IS NOT NULL AND array_length(key_values, 1) > 0
ON CONFLICT DO NOTHING;

-- brands.unique_selling_points[] → positioning > unique_selling_points > primary (valueType='array')
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, value_payload, source, source_url, last_verified)
SELECT id,
       'positioning',
       'unique_selling_points',
       'primary',
       array_to_string(unique_selling_points, ', '),
       'array',
       jsonb_build_object('items', to_jsonb(unique_selling_points)),
       'user',
       NULL,
       NOW()
FROM brands
WHERE unique_selling_points IS NOT NULL AND array_length(unique_selling_points, 1) > 0
ON CONFLICT DO NOTHING;
