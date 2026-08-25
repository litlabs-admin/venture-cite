-- Source: migrations/0099_content_cost_idempotency.sql
-- SHA256: 2086777a7848320b52712f833da05bb5eeba74e5a9c02a9b40a29395fbafb87a

-- Stable keys prevent duplicate outbox delivery from recording the same cost twice.

ALTER TABLE public.api_costs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS api_costs_idempotency_key_idx
  ON public.api_costs (idempotency_key);

REVOKE ALL PRIVILEGES ON TABLE public.api_costs FROM venturecite_outbox_worker;
GRANT INSERT (
  user_id,
  service,
  model,
  tokens_in,
  tokens_out,
  est_cost_cents,
  idempotency_key
)
ON public.api_costs TO venturecite_outbox_worker;
GRANT SELECT (idempotency_key)
ON public.api_costs TO venturecite_outbox_worker;

DROP POLICY IF EXISTS api_costs_outbox_worker_insert ON public.api_costs;
CREATE POLICY api_costs_outbox_worker_insert
  ON public.api_costs
  FOR INSERT
  TO venturecite_outbox_worker
  WITH CHECK (
    user_id = nullif(current_setting('venturecite.outbox_user_id', true), '')
    AND service <> ''
    AND tokens_in >= 0
    AND tokens_out >= 0
    AND est_cost_cents >= 0
    AND idempotency_key IS NOT NULL
  );

DROP POLICY IF EXISTS api_costs_outbox_worker_select_key ON public.api_costs;
CREATE POLICY api_costs_outbox_worker_select_key
  ON public.api_costs
  FOR SELECT
  TO venturecite_outbox_worker
  USING (user_id = nullif(current_setting('venturecite.outbox_user_id', true), ''));
