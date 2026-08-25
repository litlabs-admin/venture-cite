-- Source: migrations/0063_fact_sheet_v2_sheet_columns.sql
-- SHA256: 19fb4c19a68289e9c7201cb4a11c12cfaa23c37e5b655708f7b006f0a99da6da

-- v2: add disagreement_count + schema_version to brand_fact_sheet.
-- last_verified already exists from Spec 2 v1 (column name `last_verified`).
ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS disagreement_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 1;
