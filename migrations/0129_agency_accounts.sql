-- Agency accounts for the new onboarding "Who are you measuring?" step.
-- Design: docs/superpowers/specs/2026-09-18-onboarding-data-contract.md,
-- section "Agency accounts".
--
-- An agency is one login that owns many client brands. Ownership does not
-- change: brands stay scoped by brands.user_id, so every existing policy and
-- repository still applies. Shared multi-seat agencies need a workspace
-- table and are out of scope here.
--
-- Constant defaults make each ADD COLUMN a catalog-only change, so no table
-- rewrite. Constraints use drop-then-add so a replay converges, the same
-- shape as 0128_ask_business_context.sql.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_kind text NOT NULL DEFAULT 'brand',
  ADD COLUMN IF NOT EXISTS agency_name text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_account_kind_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_account_kind_check
  CHECK (account_kind IN ('brand', 'agency'));

-- A brand account has no agency name. An agency's name is 1-120 characters.
-- The IS NOT NULL is load-bearing: without it a NULL name makes the length
-- test NULL, and CHECK treats NULL as a pass.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_agency_name_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_agency_name_check
  CHECK (
    (account_kind = 'brand' AND agency_name IS NULL)
    OR (
      account_kind = 'agency'
      AND agency_name IS NOT NULL
      AND char_length(btrim(agency_name)) BETWEEN 1 AND 120
    )
  );

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS relationship text NOT NULL DEFAULT 'own';

ALTER TABLE public.brands
  DROP CONSTRAINT IF EXISTS brands_relationship_check;
ALTER TABLE public.brands
  ADD CONSTRAINT brands_relationship_check
  CHECK (relationship IN ('own', 'client'));

-- The request role only sees columns granted to it (0096). Without these
-- grants the new columns are invisible to request-scoped repositories.
GRANT SELECT (account_kind, agency_name), UPDATE (account_kind, agency_name)
  ON public.users
  TO venturecite_request;

GRANT SELECT (relationship), INSERT (relationship), UPDATE (relationship)
  ON public.brands
  TO venturecite_request;
