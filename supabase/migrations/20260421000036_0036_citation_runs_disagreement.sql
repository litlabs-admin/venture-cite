-- Source: migrations/0036_citation_runs_disagreement.sql
-- SHA256: 1e2b8196ab6bf6ff83e49d4330a32048f6c7604c2e7a9500c6f8a96317a4f06a

-- Per-run disagreement counter.
--
-- The matcher and analyzer LLM occasionally disagree on whether a brand was
-- cited. The matcher determines the result. The count per run
-- lets users tune their nameVariations list when the rate climbs above ~5%
-- (typical sign that the analyzer is seeing a surface form the matcher
-- hasn't been taught yet).

ALTER TABLE citation_runs
  ADD COLUMN IF NOT EXISTS disagreement_count integer NOT NULL DEFAULT 0;
