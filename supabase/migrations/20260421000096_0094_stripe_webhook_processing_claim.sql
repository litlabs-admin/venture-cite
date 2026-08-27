-- Source: migrations/0094_stripe_webhook_processing_claim.sql
-- SHA256: 2b7f24f3bcf9df6f6293cce7580f4f00ac641a0fa7a40df479aaf07f350bc2b9

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_token UUID;

CREATE INDEX IF NOT EXISTS stripe_webhook_events_claimable_idx
  ON public.stripe_webhook_events (processing_started_at)
  WHERE processed_at IS NULL;
