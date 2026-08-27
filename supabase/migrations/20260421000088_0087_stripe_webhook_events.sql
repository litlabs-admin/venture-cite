-- Source: migrations/0087_stripe_webhook_events.sql
-- SHA256: b9cfaa3502cebfa23f3cdd188c2170394491bf1a1b999656d9af9efa72aaf2b4

-- Create the Stripe webhook dedupe table that server/webhookHandlers.ts has
-- always assumed exists.
--
-- WHY THIS IS URGENT: WebhookHandlers.processWebhook() calls
-- recordStripeEvent() - an INSERT into public.stripe_webhook_events - as the
-- FIRST thing it does after signature verification, before any event is
-- dispatched. The table was never created by any migration in this repo
-- (verified: `select to_regclass('public.stripe_webhook_events')` → null),
-- so that INSERT throws "relation does not exist" on EVERY webhook delivery.
--
-- The failure mode is the worst possible one for a billing system: the
-- customer's card is charged successfully by Stripe, our endpoint 500s,
-- checkout.session.completed is never processed, and the user's access_tier
-- is never raised off "free". They have paid and received nothing. Stripe
-- then retries the delivery for up to 3 days, failing identically each time.
--
-- Columns match exactly what the handler reads and writes:
--   event_id     - Stripe's event.id, the idempotency key. PRIMARY KEY so the
--                  handler's `ON CONFLICT (event_id) DO NOTHING ... RETURNING`
--                  correctly returns zero rows on a retry.
--   event_type   - event.type, recorded for debugging unexpected traffic.
--   received_at  - when we first saw it.
--   processed_at - NULL until the handler's side effects have fully
--                  completed. The handler deliberately distinguishes
--                  "recorded" from "processed": a row with processed_at IS
--                  NULL means a previous attempt died mid-flight, and Stripe's
--                  retry MUST be allowed to re-run rather than be skipped as a
--                  duplicate. Nullable is load-bearing, not incidental.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Supports the retry-sweep question "what did we record but never finish?"
-- and keeps the unprocessed set cheap to scan as the table grows.
CREATE INDEX IF NOT EXISTS stripe_webhook_events_unprocessed_idx
  ON public.stripe_webhook_events (received_at)
  WHERE processed_at IS NULL;

-- Same posture as migration 0081: every public table has RLS enabled with no
-- policies, so the anon/authenticated PostgREST roles are default-denied.
-- This table is written only by the Express webhook route over the Drizzle
-- owner connection, which is not subject to RLS.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
