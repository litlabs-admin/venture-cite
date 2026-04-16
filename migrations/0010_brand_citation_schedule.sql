-- Add auto-citation scheduling fields to brands
ALTER TABLE brands ADD COLUMN auto_citation_schedule TEXT NOT NULL DEFAULT 'off';
ALTER TABLE brands ADD COLUMN auto_citation_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE brands ADD COLUMN last_auto_citation_at TIMESTAMP;
