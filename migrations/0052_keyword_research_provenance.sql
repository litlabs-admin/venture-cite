-- Add a provenance column to distinguish AI estimates from measured metrics.
-- A search-volume provider can supply measured metrics. All existing rows are backfilled
-- to 'ai-estimate' since they were produced by the GPT discovery flow.

ALTER TABLE keyword_research
  ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'ai-estimate';

CREATE INDEX IF NOT EXISTS keyword_research_provenance_idx ON keyword_research(provenance);
