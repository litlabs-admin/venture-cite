-- Allow the request role to schedule a brand soft delete.
-- The row policy still requires the current actor to own the brand.

GRANT SELECT (deletion_scheduled_for)
  ON public.brands
  TO venturecite_request;

GRANT UPDATE (deleted_at, deletion_scheduled_for)
  ON public.brands
  TO venturecite_request;
