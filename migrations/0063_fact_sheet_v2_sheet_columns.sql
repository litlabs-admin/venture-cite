-- v2: add disagreement_count + schema_version to brand_fact_sheet.
-- last_verified already exists from Spec 2 v1 (column name `last_verified`).
ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS disagreement_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 1;
