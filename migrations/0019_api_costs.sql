-- Per-user LLM cost / token tracking (Wave 3.2).
--
-- Each row is one provider call: tokens consumed in/out, model name,
-- est. cost in cents (computed at call time from model pricing). The
-- budget helper sums recent rows for a user to decide whether to allow
-- the next call.
--
-- user_id is varchar to match users.id (see note in 0017_audit_logs.sql).
-- ON DELETE CASCADE — when a user is hard-deleted, their cost rows go too;
-- aggregate analytics should snapshot before purge if needed.

create table if not exists public.api_costs (
  id varchar primary key default gen_random_uuid()::text,
  user_id varchar not null references public.users(id) on delete cascade,
  service text not null,                -- 'openai', 'openrouter', etc.
  model text,                           -- e.g. 'gpt-4o-mini', 'claude-3-5-sonnet'
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  est_cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);

-- Index on (user_id, created_at) for the budget rollup query — selects
-- recent rows for a single user and sums tokens.
create index if not exists api_costs_user_created_idx
  on public.api_costs (user_id, created_at desc);

alter table public.api_costs enable row level security;
