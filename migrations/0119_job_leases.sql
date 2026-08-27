create table if not exists job_leases (
  lease_key     text primary key,
  holder_token  uuid        not null,
  acquired_at   timestamptz not null default now(),
  expires_at    timestamptz not null,
  heartbeat_at  timestamptz not null default now()
);

create index if not exists job_leases_expires_at_idx on job_leases (expires_at);
