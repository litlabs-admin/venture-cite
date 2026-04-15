-- Weekly report + Buffer social publishing fields on users
alter table public.users add column if not exists weekly_report_enabled integer not null default 1;
alter table public.users add column if not exists last_weekly_report_sent_at timestamptz;
alter table public.users add column if not exists buffer_access_token text;
