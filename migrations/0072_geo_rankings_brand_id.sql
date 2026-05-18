-- Denormalized brand_id on geo_rankings.
--
-- geo_rankings previously had no brand_id; every consumer derived the
-- brand by joining through brand_prompts (brand_prompt_id) or articles
-- (article_id) — an easy "forgot the join -> wrong brand's data" footgun
-- and an extra hop on hot read paths.
--
-- Add the column nullable + indexed, backfill from both join paths
-- (article path first, then the brand_prompt path), and let new writes
-- set it directly (server/citationChecker.ts runBrandPrompts + the
-- POST /api/geo-rankings handler). Kept NULLABLE on purpose:
-- brand_prompt_id is ON DELETE SET NULL, so a row can outlive both join
-- sources; forcing NOT NULL would be a separate, riskier follow-up.

ALTER TABLE public.geo_rankings
  ADD COLUMN IF NOT EXISTS brand_id varchar
  REFERENCES public.brands(id) ON DELETE CASCADE;

-- Backfill: article path is deterministic (articles.brand_id NOT NULL).
UPDATE public.geo_rankings gr
SET brand_id = a.brand_id
FROM public.articles a
WHERE gr.article_id = a.id
  AND gr.brand_id IS NULL;

-- Then the brand_prompt path for the citation-run rows.
UPDATE public.geo_rankings gr
SET brand_id = bp.brand_id
FROM public.brand_prompts bp
WHERE gr.brand_prompt_id = bp.id
  AND gr.brand_id IS NULL;

CREATE INDEX IF NOT EXISTS geo_rankings_brand_id_idx
  ON public.geo_rankings (brand_id);
