-- Source: migrations/0137_geo_rankings_outcome.sql
-- SHA256: 6c715a19309b60a4c1819acc4c55de310a87520022a33115edb70dfa69bcc260

-- A failed provider call is stored as an ordinary row whose failure lives only in a
-- "Check failed: " prefix inside citation_context. Legacy rows without an outcome
-- are not evidence that a provider answered.
ALTER TABLE public.geo_rankings
  ADD COLUMN IF NOT EXISTS outcome text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'geo_rankings_outcome_check'
  ) THEN
    ALTER TABLE public.geo_rankings
      ADD CONSTRAINT geo_rankings_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('successful', 'unavailable', 'failed'));
  END IF;
END $$;

-- Backfill, most trustworthy source first.
UPDATE public.geo_rankings
   SET outcome = metadata->>'outcome'
 WHERE outcome IS NULL
   AND metadata->>'outcome' IN ('successful', 'unavailable', 'failed');

UPDATE public.geo_rankings
   SET outcome = 'failed'
 WHERE outcome IS NULL
   AND citation_context LIKE 'Check failed:%';

-- Everything else predates outcome capture. It is not evidence of success.
UPDATE public.geo_rankings
   SET outcome = 'unavailable'
 WHERE outcome IS NULL;

CREATE INDEX IF NOT EXISTS geo_rankings_brand_outcome_idx
  ON public.geo_rankings (brand_id, outcome);
