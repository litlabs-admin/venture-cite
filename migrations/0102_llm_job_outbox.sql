-- Move generic OpenAI LLM kickoffs behind the transactional outbox.

ALTER TABLE public.llm_jobs
  ADD COLUMN IF NOT EXISTS provider_request JSONB;

ALTER TABLE public.llm_jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.outbox_commands
  DROP CONSTRAINT IF EXISTS outbox_commands_kind_check;

ALTER TABLE public.outbox_commands
  ADD CONSTRAINT outbox_commands_kind_check
  CHECK (kind IN (
    'stripe.create_customer',
    'resend.send_email',
    'buffer.create_post',
    'openai.create_response',
    'openai.start_llm_job',
    'content_cost.record'
  ));

REVOKE ALL PRIVILEGES ON TABLE public.llm_jobs FROM venturecite_outbox_worker;
GRANT SELECT (id, status, response_id, provider_request)
  ON public.llm_jobs TO venturecite_outbox_worker;
GRANT UPDATE (response_id, status, started_at, completed_at, error_kind, error_message)
  ON public.llm_jobs TO venturecite_outbox_worker;

DROP POLICY IF EXISTS llm_jobs_outbox_worker_select ON public.llm_jobs;
CREATE POLICY llm_jobs_outbox_worker_select
  ON public.llm_jobs
  FOR SELECT
  TO venturecite_outbox_worker
  USING (true);

DROP POLICY IF EXISTS llm_jobs_outbox_worker_update ON public.llm_jobs;
CREATE POLICY llm_jobs_outbox_worker_update
  ON public.llm_jobs
  FOR UPDATE
  TO venturecite_outbox_worker
  USING (status = 'pending')
  WITH CHECK (
    (status = 'running' AND response_id IS NOT NULL AND started_at IS NOT NULL)
    OR
    (status = 'failed' AND completed_at IS NOT NULL AND error_kind IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION private.enqueue_openai_start_llm_job(p_llm_job_id TEXT)
RETURNS TABLE (id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  job public.llm_jobs%ROWTYPE;
  actor_id TEXT := nullif(btrim(current_setting('venturecite.user_id', true)), '');
  active_role TEXT := nullif(current_setting('role', true), 'none');
  command_id TEXT;
  command_payload JSONB;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'llm job outbox actor is required';
  END IF;

  IF active_role IS DISTINCT FROM 'venturecite_content_request'
     OR NOT pg_has_role(session_user, 'venturecite_content_request', 'member') THEN
    RAISE EXCEPTION 'llm job outbox caller is not authorized';
  END IF;

  SELECT * INTO job
  FROM public.llm_jobs
  WHERE llm_jobs.id = p_llm_job_id
  FOR UPDATE;

  IF NOT FOUND OR job.user_id IS NULL OR job.brand_id IS NULL THEN
    RAISE EXCEPTION 'llm job outbox row is invalid';
  END IF;
  IF job.user_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'llm job outbox actor does not own the job';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.brands
    WHERE brands.id = job.brand_id
      AND brands.user_id = job.user_id
      AND brands.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'llm job outbox brand is not active for the actor';
  END IF;
  IF job.status <> 'pending' OR job.provider_request IS NULL THEN
    RAISE EXCEPTION 'llm job outbox row is not pending';
  END IF;

  command_payload := jsonb_build_object('kind', 'openai.start_llm_job', 'llmJobId', job.id);
  INSERT INTO public.outbox_commands (
    kind, idempotency_key, aggregate_type, aggregate_id, user_id, brand_id,
    payload, payload_fingerprint, max_attempts, provider_name, provider_operation
  )
  VALUES (
    'openai.start_llm_job',
    'openai-start-llm-job:' || job.id,
    'llm_job', job.id, job.user_id, job.brand_id,
    command_payload,
    encode(sha256(convert_to(command_payload::text, 'UTF8')), 'hex'),
    25, 'openai', 'start_llm_job'
  )
  ON CONFLICT (provider_name, idempotency_key) DO NOTHING
  RETURNING outbox_commands.id INTO command_id;

  IF command_id IS NULL THEN
    SELECT command.id INTO command_id
    FROM public.outbox_commands AS command
    WHERE command.provider_name = 'openai'
      AND command.idempotency_key = 'openai-start-llm-job:' || job.id
      AND command.kind = 'openai.start_llm_job'
      AND command.aggregate_type = 'llm_job'
      AND command.aggregate_id = job.id
      AND command.user_id = job.user_id
      AND command.brand_id = job.brand_id;
    IF command_id IS NULL THEN
      RAISE EXCEPTION 'llm job outbox idempotency key conflicts';
    END IF;
  END IF;

  RETURN QUERY SELECT command_id;
END
$$;

REVOKE ALL ON FUNCTION private.enqueue_openai_start_llm_job(TEXT) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO venturecite_content_request;
GRANT EXECUTE ON FUNCTION private.enqueue_openai_start_llm_job(TEXT)
  TO venturecite_content_request;
