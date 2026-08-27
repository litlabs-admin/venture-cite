-- Source: migrations/0099_prompt_phrasing_tests.sql
-- SHA256: d1d217884c7afbb922ea1e182ce3b45648a18bae7290a383391f2cefc6defab0

-- Prompts rebuild, phase 5: Phrasings.
--
-- Deliberately separate from geo_rankings - phrasing variants are
-- exploratory tests of a rephrased question, not the tracked prompt's real
-- history, so mixing them in would corrupt the Score/Δ/sparkline columns
-- (which read from geo_rankings only).
CREATE TABLE IF NOT EXISTS public.prompt_phrasing_tests (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_prompt_id  VARCHAR NOT NULL REFERENCES public.brand_prompts(id) ON DELETE CASCADE,
  phrasing         TEXT NOT NULL,
  rationale        TEXT,
  results          JSONB,
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prompt_phrasing_tests_prompt_id_idx
  ON public.prompt_phrasing_tests (brand_prompt_id);

ALTER TABLE public.prompt_phrasing_tests ENABLE ROW LEVEL SECURITY;
