-- Source: migrations/0004_user_integrations.sql
-- SHA256: 9ecd2fb2f25836076da57bd1caea9ae7649a73e72d6e14a69764de1b6e4a7f56

-- Weekly report + Buffer social publishing fields on users
alter table public.users add column if not exists weekly_report_enabled integer not null default 1;
alter table public.users add column if not exists last_weekly_report_sent_at timestamptz;
alter table public.users add column if not exists buffer_access_token text;
