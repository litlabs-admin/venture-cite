-- Source: migrations/0010_brand_citation_schedule.sql
-- SHA256: 457202e54dfcd27155dcf51115d49bb896f2baba23a35f7987b2dab26ca21cf4

-- Add auto-citation scheduling fields to brands.
-- IF NOT EXISTS on every column so a fresh database bootstrapped via
-- `drizzle-kit push` (which already creates these from shared/schema.ts)
-- doesn't hit a duplicate_column error that aborts boot and re-fails on
-- every subsequent start (the migration never gets recorded).
ALTER TABLE brands ADD COLUMN IF NOT EXISTS auto_citation_schedule TEXT NOT NULL DEFAULT 'off';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS auto_citation_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS last_auto_citation_at TIMESTAMP;
