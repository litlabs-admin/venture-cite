-- Source: migrations/0122_api_costs_cost_precision.sql
-- SHA256: dd02c3d575ce0eaceb46e223e478b85e75ea37f44a146778d9c7365cede1d70c

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
    -- The insert policy's WITH CHECK references est_cost_cents, and Postgres
    -- refuses ALTER COLUMN ... TYPE while any policy depends on the column
    -- ("cannot alter type of a column used in a policy definition"). Drop it,
    -- retype, and recreate it.
    --
    -- The recreated policy is the CURRENT shape from
    -- 0113_rls_current_setting_initplan.sql - the `(select current_setting(...))`
    -- wrapper, not 0099's bare call - because 0113 runs before this migration
    -- and its wrapper is what makes the check an InitPlan rather than a
    -- per-row evaluation. Recreating 0099's older shape here would silently
    -- undo that optimisation.
    --
    -- Column-level GRANTs on est_cost_cents are NOT re-issued: privileges
    -- attach to the column identity, which ALTER TYPE preserves. Only the
    -- policy dependency blocks the retype.
    DROP POLICY IF EXISTS api_costs_outbox_worker_insert ON public.api_costs;

    ALTER TABLE public.api_costs
      ALTER COLUMN est_cost_cents TYPE numeric(12, 6) USING est_cost_cents::numeric(12, 6),
      ALTER COLUMN est_cost_cents SET DEFAULT 0;

    CREATE POLICY api_costs_outbox_worker_insert
      ON public.api_costs
      FOR INSERT
      TO venturecite_outbox_worker
      WITH CHECK (
        user_id = nullif((select current_setting('venturecite.outbox_user_id', true)), '')
        AND service <> ''
        AND tokens_in >= 0
        AND tokens_out >= 0
        AND est_cost_cents >= 0
        AND idempotency_key IS NOT NULL
      );
  END IF;
END
$$;
