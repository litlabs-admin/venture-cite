-- Email deliverability hardening (Wave 3.6).
--
-- 1. users.email_status: tracks whether the user's email address is
--    deliverable. Values: 'active' (default), 'bounced', 'complained',
--    'unsubscribed'. The email service skips sends for any non-active
--    status to avoid hurting our domain reputation.
--
-- 2. email_failures: dead-letter queue. After the retry helper has
--    exhausted its attempts, the message lands here so we can inspect /
--    requeue / surface in an admin UI.

alter table public.users
  add column if not exists email_status text default 'active' not null;

create index if not exists users_email_status_idx
  on public.users (email_status)
  where email_status <> 'active';

create table if not exists public.email_failures (
  id varchar primary key default gen_random_uuid()::text,
  user_id varchar references public.users(id) on delete set null,
  template text not null,
  to_address text not null,
  payload_jsonb jsonb,
  last_error text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists email_failures_created_idx
  on public.email_failures (created_at desc);

alter table public.email_failures enable row level security;
