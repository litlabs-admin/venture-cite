-- Keep the profile activity timestamp inside the restricted request transaction.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'venturecite_request'
      AND shobj_description(oid, 'pg_authid') = 'venturecite request role managed by migration 0096'
  ) THEN
    RAISE EXCEPTION 'venturecite_request is not managed by migration 0096';
  END IF;
END
$$;

GRANT UPDATE (updated_at) ON public.users TO venturecite_request;
