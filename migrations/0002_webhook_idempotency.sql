-- Stripe webhook idempotency table.
-- Stripe retries webhooks on any non-2xx response (and occasionally even on
-- network glitches that returned 2xx), so every handler MUST be safe to run
-- twice. Recording the event.id before processing lets us short-circuit on
-- the retry. Idempotent: CREATE TABLE IF NOT EXISTS, safe to re-run on
-- every boot.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists stripe_webhook_events_received_idx
  on public.stripe_webhook_events (received_at desc);

alter table public.stripe_webhook_events enable row level security;
