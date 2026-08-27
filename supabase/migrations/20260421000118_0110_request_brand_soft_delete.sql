-- Source: migrations/0110_request_brand_soft_delete.sql
-- SHA256: e380ca1d0878342d1b3af56d51eb133c2e7708e0cd9a5300219990bb15d9ed57

-- Allow the request role to schedule a brand soft delete.
-- The row policy still requires the current actor to own the brand.

GRANT SELECT (deletion_scheduled_for)
  ON public.brands
  TO venturecite_request;

GRANT UPDATE (deleted_at, deletion_scheduled_for)
  ON public.brands
  TO venturecite_request;
