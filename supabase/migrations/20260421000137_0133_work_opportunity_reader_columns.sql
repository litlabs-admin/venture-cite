-- Source: migrations/0133_work_opportunity_reader_columns.sql
-- SHA256: 12cef0eeb5e4995f527baf4245ff7d63a5ae10147a1e1c662bf60e043099b9df

-- Complete the read projection for the production work opportunity readers.
-- This migration adds column grants only. It grants no write privilege.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'venturecite_request'
  ) THEN
    RAISE EXCEPTION 'venturecite_request must be created by migration 0096 first';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO venturecite_request;

GRANT SELECT (id, user_id, deleted_at)
  ON public.brands TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  domain,
  subcategory,
  fact_key,
  fact_value,
  source,
  accepted_at,
  dismissed_at,
  is_active,
  source_url,
  run_id,
  source_excerpt,
  metadata
)
  ON public.brand_fact_sheet TO venturecite_request;

GRANT SELECT (id, brand_id, status, completed_at)
  ON public.brand_fact_scrape_runs TO venturecite_request;

GRANT SELECT (
  id,
  run_id,
  url,
  canonical_url,
  status,
  fetched_at,
  status_code,
  excerpt
)
  ON public.brand_fact_scrape_pages TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  generation_id,
  prompt,
  status,
  paused,
  order_index
)
  ON public.brand_prompts TO venturecite_request;

GRANT SELECT (id, brand_id, generation_number)
  ON public.prompt_generations TO venturecite_request;
