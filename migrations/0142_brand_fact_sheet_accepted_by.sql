-- Record who accepted a brand fact.
--
-- The column already exists in the local development database, but it was
-- added out of band and no migration ever created it, so a database built
-- from `migrations/` alone does not have it. `if not exists` makes this safe
-- to apply to both: the developed database keeps the column it has, and a
-- fresh one gains it.
--
-- Nullable on purpose. Rows accepted before this column was written have no
-- recorded actor, and inventing one would be worse than admitting the gap.
-- A null here means "accepted before attribution was recorded", which is not
-- the same as "nobody accepted it" - that case is accepted_at being null.

alter table public.brand_fact_sheet
  add column if not exists accepted_by varchar;

comment on column public.brand_fact_sheet.accepted_by is
  'User who accepted this fact. Null for rows accepted before attribution was recorded.';
