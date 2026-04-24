-- Revenue stored as integer cents (Wave 4.1).
--
-- Why: summing JS Numbers across thousands of $19.99 rows accumulates
-- floating-point error fast (every fifth-and-tenth cent value is
-- inexact in IEEE 754). Postgres `numeric(10,2)` is exact at rest, but
-- the moment it crosses into JS via the pg driver it becomes a string,
-- and every analytics rollup converts back to Number — losing precision
-- on every sum.
--
-- Storing cents as bigint sidesteps the whole problem: Postgres sums
-- integers exactly, JS handles them as Number safely up to 2^53 cents
-- (~$90 trillion), and the display layer divides by 100 only at render.
--
-- Migration leaves the legacy `revenue` numeric column in place during
-- the transition so any read path that hasn't migrated yet keeps
-- working. A future migration can drop it once we've confirmed every
-- code path is on `revenue_cents`.

alter table public.purchase_events
  add column if not exists revenue_cents bigint;

-- Backfill from existing numeric revenue. Math is exact in Postgres.
update public.purchase_events
set revenue_cents = (revenue * 100)::bigint
where revenue_cents is null and revenue is not null;

-- Same treatment for ai_commerce_sessions.conversion_value (also money) —
-- but only if the legacy numeric column exists. In some environments the
-- table never had a conversion_value column (it was planned but never
-- landed), so we add the _cents column unconditionally and only backfill
-- when there's something to copy from.
alter table public.ai_commerce_sessions
  add column if not exists conversion_value_cents bigint;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_commerce_sessions'
      and column_name = 'conversion_value'
  ) then
    execute $sql$
      update public.ai_commerce_sessions
      set conversion_value_cents = (conversion_value * 100)::bigint
      where conversion_value_cents is null and conversion_value is not null
    $sql$;
  end if;
end
$$;
