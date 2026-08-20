-- Source: migrations/0052_keyword_research_provenance.sql
-- SHA256: 18256fff2cb2a1476726b568d8b3e202e156687d8679f348aac4af3537eb827c

-- Add a provenance column to distinguish AI estimates from measured metrics.
-- A search-volume provider can supply measured metrics. All existing rows are backfilled
-- to 'ai-estimate' since they were produced by the GPT discovery flow.

ALTER TABLE keyword_research
  ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'ai-estimate';

CREATE INDEX IF NOT EXISTS keyword_research_provenance_idx ON keyword_research(provenance);
