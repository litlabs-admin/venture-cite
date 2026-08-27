-- Source: migrations/0063_fact_sheet_v2_sheet_columns.sql
-- SHA256: 77fe86cf0e74c2d3dc4523baa0a311069001e289a3e4af6c7dcc1d9d06b4d9e5

-- v2: add disagreement_count + schema_version to brand_fact_sheet.
-- last_verified already exists from Spec 2 v1 (column name `last_verified`).
ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS disagreement_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 1;
