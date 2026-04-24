-- Shopify webhook idempotency table.
-- Shopify identifies each webhook delivery with X-Shopify-Webhook-Id and
-- retries on any non-2xx response (and occasionally on network blips that
-- returned 2xx). Recording the webhook id before processing lets us
-- short-circuit on the retry. Idempotent: CREATE TABLE IF NOT EXISTS,
-- safe to re-run on every boot.

create table if not exists public.shopify_webhook_events (
  webhook_id text primary key,
  topic text not null,
  shop_domain text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists shopify_webhook_events_received_idx
  on public.shopify_webhook_events (received_at desc);

alter table public.shopify_webhook_events enable row level security;
