-- Source: migrations/0139_fault_repair_reader_grants.sql
-- SHA256: 60483afb0a14e8dd02890b908c4a3fbcc265b2cded22226a330db3cb0fd40a1b

-- Read projection for the fault_repair evidence reader. Column grants only; no write
-- privilege. Without this the reader runs under venturecite_request, is denied, and the
-- failure is swallowed by the caller's try/catch: no evidence authorised, no error shown.
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

GRANT SELECT (
  id,
  brand_id,
  ranking_id,
  resolved_ranking_id,
  resolved_at,
  is_resolved,
  remediation_status,
  ai_platform
) ON public.brand_hallucinations TO venturecite_request;
