-- Per-user notification preferences (Wave 6.8).
--
-- Today there's a single flag (users.weekly_report_enabled) controlling
-- the one notification type we send. The audit asks for a proper
-- preferences centre: the user should be able to toggle each type
-- independently, and future notification types (product updates,
-- competitor alerts, etc.) need somewhere to live without accreting
-- more boolean columns on the users table.
--
-- Shape: one row per (user, type). Missing row == default (enabled).
-- Critical notifications (billing, security) are never stored here —
-- they're hardcoded at the send site as non-dismissable.
--
-- weekly_report_enabled stays in place for back-compat with the
-- scheduler + unsubscribe route. Writes through the preferences API
-- dual-write both columns so either read path stays consistent.

create table if not exists public.notification_preferences (
  user_id varchar not null references public.users(id) on delete cascade,
  type text not null,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

create index if not exists notification_preferences_user_idx
  on public.notification_preferences(user_id);

-- Seed: copy the existing weekly_report_enabled flag into the new
-- table so the first read through the preferences API reflects the
-- user's current state. Idempotent — safe to re-run.
insert into public.notification_preferences (user_id, type, email_enabled)
select id, 'weekly_report', weekly_report_enabled = 1
  from public.users
on conflict (user_id, type) do nothing;
