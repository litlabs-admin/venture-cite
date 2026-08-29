-- Source: migrations/0122_api_costs_cost_precision.sql
-- SHA256: ae520b4cbac2cb00b083470917f7f50821a00aa297480d02cd4fdd92bde2fd71

-- Widen api_costs.est_cost_cents so a sub-cent call can be stored.
--
-- est_cost_cents was `integer`, and the value written to it is rounded per
-- call (server/lib/llmPricing.ts, estimateCostCents). Any single call
-- costing under half a cent rounded to 0 before it ever reached this column,
-- and cheap high-frequency models rounded to 0 essentially every time.
-- estimateCostCents no longer rounds away the fraction; this migration makes
-- the column able to hold what it now receives.
--
-- numeric(12,6): six fractional digits is more headroom than the pricing
-- table's per-1k rates need (the smallest, 0.010, already produces
-- sub-thousandth-of-a-cent per-token contributions), and twelve total digits
-- covers any single call anyone will plausibly place through this app with
-- room to spare. The unit stored is unchanged - cents, not dollars.
--
-- Existing integer values are preserved exactly by the cast: an existing row
-- of 5 becomes 5.000000, which reads back and compares equal to 5. Nothing
-- about a historical row's meaning changes. Historical rows that rounded to
-- 0 stay 0 here - this migration does not recompute them. See
-- .audit/B6/B6a-11-cost-precision.md for the recompute query, deliberately
-- not run by this migration.
--
-- Guarded by a type check so a replay against a database where this already
-- applied is a no-op rather than a second table rewrite.
DO $$
BEGIN
  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'api_costs'
      AND column_name = 'est_cost_cents'
  ) = 'integer' THEN
    ALTER TABLE public.api_costs
      ALTER COLUMN est_cost_cents TYPE numeric(12, 6) USING est_cost_cents::numeric(12, 6),
      ALTER COLUMN est_cost_cents SET DEFAULT 0;
  END IF;
END
$$;
