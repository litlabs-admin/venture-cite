-- Source: migrations/0097_prompt_audiences.sql
-- SHA256: 7c18eb57c7f7907254993a98df9f46ed190c9913b279f0c638b51d13f4df9b2d

-- Prompts rebuild, phase 3: Audiences.
--
-- Real entity + join table, same reasoning as prompt_tags/brand_prompt_tags
-- (migration 0096) - an audience groups prompts the same way a tag does, but
-- also carries a funnel stage. funnel_stage reuses brand_prompts.funnel_stage's
-- existing TOFU/MOFU/BOFU vocabulary rather than a new enum.
CREATE TABLE IF NOT EXISTS public.prompt_audiences (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  funnel_stage  TEXT,
  generated_by  TEXT NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prompt_audiences_brand_id_idx ON public.prompt_audiences (brand_id);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_audiences_brand_name_uq
  ON public.prompt_audiences (brand_id, lower(name));

CREATE TABLE IF NOT EXISTS public.brand_prompt_audiences (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_prompt_id  VARCHAR NOT NULL REFERENCES public.brand_prompts(id) ON DELETE CASCADE,
  audience_id      VARCHAR NOT NULL REFERENCES public.prompt_audiences(id) ON DELETE CASCADE,
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_prompt_audiences_prompt_id_idx ON public.brand_prompt_audiences (brand_prompt_id);
CREATE INDEX IF NOT EXISTS brand_prompt_audiences_audience_id_idx ON public.brand_prompt_audiences (audience_id);
CREATE UNIQUE INDEX IF NOT EXISTS brand_prompt_audiences_prompt_audience_uq
  ON public.brand_prompt_audiences (brand_prompt_id, audience_id);

ALTER TABLE public.prompt_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_prompt_audiences ENABLE ROW LEVEL SECURITY;
