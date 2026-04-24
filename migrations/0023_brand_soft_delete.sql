-- Soft-delete columns for brands (Wave 4.5).
--
-- Mirrors users.deleted_at / deletion_scheduled_for from Wave 2.2.
-- Today brand DELETE cascades to ~20 tables in one transaction —
-- irreversible and arguably wrong for a customer-facing "delete brand"
-- button. After this migration:
--   - DELETE handler sets deleted_at + deletion_scheduled_for=now+30d.
--   - List/read queries filter `deleted_at IS NULL` so the brand
--     disappears from the UI immediately.
--   - Daily cron (runBrandPurgeJob in scheduler.ts) hard-deletes
--     brands past their grace window — at which point the existing FK
--     cascade kicks in and clears all child rows.
--
-- The 30-day grace gives an operator a window to restore an
-- accidentally-deleted brand by clearing both columns. After grace,
-- data is gone.

alter table public.brands
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz;

create index if not exists brands_deletion_scheduled_idx
  on public.brands (deletion_scheduled_for)
  where deletion_scheduled_for is not null;
