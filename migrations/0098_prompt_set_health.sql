-- Prompts rebuild, phase 4: Set Health audit.
--
-- One row per audit run. score/verdict null together when there isn't
-- enough evidence to judge - same "zero-evidence returns null, never a
-- fabricated number" rule as brand_perception_runs (migration that added
-- that table).
CREATE TABLE IF NOT EXISTS public.prompt_set_health_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  score         INTEGER,
  verdict       TEXT,
  top_fix       JSONB,
  issues        JSONB NOT NULL DEFAULT '[]'::jsonb,
  working_well  TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prompt_set_health_runs_brand_created_idx
  ON public.prompt_set_health_runs (brand_id, created_at DESC);

ALTER TABLE public.prompt_set_health_runs ENABLE ROW LEVEL SECURITY;
