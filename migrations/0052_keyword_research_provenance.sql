-- Wave 0052: Add provenance column to keyword_research so we can distinguish
-- AI-estimated metrics (current state) from measured metrics (future state once
-- a real search-volume provider is wired in). All existing rows are backfilled
-- to 'ai-estimate' since they were produced by the GPT discovery flow.

ALTER TABLE keyword_research
  ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'ai-estimate';

CREATE INDEX IF NOT EXISTS keyword_research_provenance_idx ON keyword_research(provenance);
