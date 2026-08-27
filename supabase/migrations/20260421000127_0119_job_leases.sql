-- Source: migrations/0119_job_leases.sql
-- SHA256: 5744ba4a723d4f856f0f42613c6395a14dfaabfa850fd1696f1262c0ef2e88a5

create table if not exists job_leases (
  lease_key     text primary key,
  holder_token  uuid        not null,
  acquired_at   timestamptz not null default now(),
  expires_at    timestamptz not null,
  heartbeat_at  timestamptz not null default now()
);

create index if not exists job_leases_expires_at_idx on job_leases (expires_at);
