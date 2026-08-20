ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_token UUID;

CREATE INDEX IF NOT EXISTS stripe_webhook_events_claimable_idx
  ON public.stripe_webhook_events (processing_started_at)
  WHERE processed_at IS NULL;
