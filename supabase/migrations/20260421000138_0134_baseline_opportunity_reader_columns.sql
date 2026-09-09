-- Source: migrations/0134_baseline_opportunity_reader_columns.sql
-- SHA256: dbaaefdf64efc0f35265f6f3d49d907d9ce57e68cec942bf308fa39fe1441eb1

-- Add the read projection required by the actor-scoped baseline opportunity source.
-- This migration grants read access only. Row-level policies keep the brand scope.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'venturecite_request'
  ) THEN
    RAISE EXCEPTION 'venturecite_request must be created by migration 0096 first';
  END IF;
END
$$;

GRANT SELECT (id, brand_id, generation_number, created_at)
  ON public.prompt_generations TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  generation_id,
  prompt,
  status,
  paused,
  region
)
  ON public.brand_prompts TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  started_at,
  completed_at,
  status
)
  ON public.citation_runs TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  brand_prompt_id,
  run_id,
  ai_platform,
  prompt,
  is_cited,
  checked_at,
  metadata
)
  ON public.geo_rankings TO venturecite_request;
