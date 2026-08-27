-- Source: migrations/0036_citation_runs_disagreement.sql
-- SHA256: 8ee8bb922f4720c3ed63181719af558a819414ba2948c60ae752d698f0133118

-- Per-run disagreement counter.
--
-- The matcher and analyzer LLM occasionally disagree on whether a brand was
-- cited. The matcher determines the result. The count per run
-- lets users tune their nameVariations list when the rate climbs above ~5%
-- (typical sign that the analyzer is seeing a surface form the matcher
-- hasn't been taught yet).

ALTER TABLE citation_runs
  ADD COLUMN IF NOT EXISTS disagreement_count integer NOT NULL DEFAULT 0;
