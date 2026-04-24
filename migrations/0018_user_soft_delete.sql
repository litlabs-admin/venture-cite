-- Soft-delete columns on users for GDPR Art. 17 (right to erasure).
--
-- Flow:
--   1. POST /api/user/delete sets deleted_at = now() and
--      deletion_scheduled_for = now() + 30 days. The row stays.
--   2. Auth middleware refuses logins for users with deleted_at set
--      (prevents the user from continuing to use the app while in grace).
--   3. A daily cron job hard-deletes any user whose
--      deletion_scheduled_for has passed. Cascades via existing FKs
--      from migrations/0003_fk_hardening.sql clean up brand-rooted
--      data automatically.
--
-- The 30-day grace is for accidental-delete recovery (an admin can
-- manually clear deleted_at + deletion_scheduled_for to restore).
-- After grace, data is gone.

alter table public.users
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz;

create index if not exists users_deletion_scheduled_idx
  on public.users (deletion_scheduled_for)
  where deletion_scheduled_for is not null;
