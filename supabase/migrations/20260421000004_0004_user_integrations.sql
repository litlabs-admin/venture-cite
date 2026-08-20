-- Source: migrations/0004_user_integrations.sql
-- SHA256: 1ca6fa700693db8840bd9242cbaef663d2a1bd72dd3ded9e61abd88d524945af

-- Weekly report + Buffer social publishing fields on users
alter table public.users add column if not exists weekly_report_enabled integer not null default 1;
alter table public.users add column if not exists last_weekly_report_sent_at timestamptz;
alter table public.users add column if not exists buffer_access_token text;
