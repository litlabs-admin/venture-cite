-- Source: migrations/0138_hallucination_resolved_ranking.sql
-- SHA256: 5bd42b6d91b6a7d372c0af6cb6676fc569219f9f22bce854213dd57825dd39b0

-- ranking_id records the observation that detected the fault. Re-verification proves the
-- repair but discarded the observation that proved it, so a fault_repair evidence reference
-- had a beforeCheckId and no afterCheckId. This column supplies the second half.
ALTER TABLE public.brand_hallucinations
  ADD COLUMN IF NOT EXISTS resolved_ranking_id varchar;

CREATE INDEX IF NOT EXISTS brand_hallucinations_resolved_ranking_idx
  ON public.brand_hallucinations (resolved_ranking_id);
