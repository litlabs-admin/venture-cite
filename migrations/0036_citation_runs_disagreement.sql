-- Wave 9: per-run disagreement counter.
--
-- The matcher and analyzer LLM occasionally disagree on whether a brand was
-- cited (matcher is authoritative — Wave 8). Surfacing the count per run
-- lets users tune their nameVariations list when the rate climbs above ~5%
-- (typical sign that the analyzer is seeing a surface form the matcher
-- hasn't been taught yet).

ALTER TABLE citation_runs
  ADD COLUMN IF NOT EXISTS disagreement_count integer NOT NULL DEFAULT 0;
