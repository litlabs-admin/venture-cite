-- Read projections for experiment and outcome-review opportunity readers.
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

GRANT SELECT (id, brand_id, status, published_at)
  ON public.bofu_content TO venturecite_request;

GRANT SELECT (id, brand_id, status, completed_at)
  ON public.citation_runs TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  task_version,
  task_type,
  title,
  state,
  updated_at
)
  ON public.work_tasks TO venturecite_request;

GRANT SELECT (task_id, brand_id, task_version)
  ON public.work_outcome_reviews TO venturecite_request;
