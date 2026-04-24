-- Audit log for sensitive operations (brand delete, account delete,
-- subscription change, admin actions, …).
--
-- Why a dedicated table instead of just relying on Pino logs?
--   - Persisted in the database alongside the data it describes, so
--     nothing is lost when log retention rotates.
--   - Queryable per user (GDPR access requests, internal investigations).
--   - before/after JSONB snapshots let us reconstruct what changed
--     without trawling structured log files.
--
-- user_id is ON DELETE SET NULL so the audit row survives an account
-- deletion — keeping a record of *that the deletion happened* is the
-- whole point. We accept that detached rows can't be re-linked to a
-- live user.

-- Note: user_id is varchar (not uuid) to match users.id, which is
-- declared as varchar in shared/schema.ts even though its values are
-- gen_random_uuid()-generated strings.
create table if not exists public.audit_logs (
  id varchar primary key default gen_random_uuid()::text,
  user_id varchar references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_jsonb jsonb,
  after_jsonb jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_user_idx
  on public.audit_logs (user_id, created_at desc);

create index if not exists audit_logs_action_idx
  on public.audit_logs (action, created_at desc);

alter table public.audit_logs enable row level security;
