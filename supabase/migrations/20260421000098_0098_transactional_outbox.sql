-- Source: migrations/0098_transactional_outbox.sql
-- SHA256: 668d46b0fe4992e25a8282c5fd4227a5f0e66738305cc0542cd3943d18f136fc

CREATE TABLE IF NOT EXISTS public.outbox_commands (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  brand_id TEXT REFERENCES public.brands(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT,
  provider_name TEXT NOT NULL,
  provider_operation TEXT NOT NULL,
  provider_result JSONB,
  provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ
  ,cancellation_requested_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_commands_kind_check'
      AND conrelid = 'public.outbox_commands'::regclass
  ) THEN
    ALTER TABLE public.outbox_commands
      ADD CONSTRAINT outbox_commands_kind_check
      CHECK (kind IN (
        'stripe.create_customer',
        'resend.send_email',
        'buffer.create_post',
        'openai.create_response',
        'content_cost.record'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbox_commands_error_code_check' AND conrelid = 'public.outbox_commands'::regclass) THEN
    ALTER TABLE public.outbox_commands ADD CONSTRAINT outbox_commands_error_code_check
      CHECK (last_error_code IS NULL OR last_error_code IN ('unknown_error','attempts_exhausted','provider_timeout','provider_unavailable','invalid_command','recipient_rejected','provider_rejected','cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_commands_status_check'
      AND conrelid = 'public.outbox_commands'::regclass
  ) THEN
    ALTER TABLE public.outbox_commands
      ADD CONSTRAINT outbox_commands_status_check
      CHECK (status IN ('pending', 'processing', 'succeeded', 'dead_letter', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_commands_attempt_count_check'
      AND conrelid = 'public.outbox_commands'::regclass
  ) THEN
    ALTER TABLE public.outbox_commands
      ADD CONSTRAINT outbox_commands_attempt_count_check
      CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_commands_payload_check'
      AND conrelid = 'public.outbox_commands'::regclass
  ) THEN
    ALTER TABLE public.outbox_commands
      ADD CONSTRAINT outbox_commands_payload_check
      CHECK (jsonb_typeof(payload) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_commands_processing_lease_check'
      AND conrelid = 'public.outbox_commands'::regclass
  ) THEN
    ALTER TABLE public.outbox_commands
      ADD CONSTRAINT outbox_commands_processing_lease_check
      CHECK (
        (status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_commands_terminal_state_check'
      AND conrelid = 'public.outbox_commands'::regclass
  ) THEN
    ALTER TABLE public.outbox_commands
      ADD CONSTRAINT outbox_commands_terminal_state_check
      CHECK (
        (status = 'pending' AND completed_at IS NULL AND dead_lettered_at IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
        OR (status = 'processing' AND completed_at IS NULL AND dead_lettered_at IS NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (status = 'succeeded' AND completed_at IS NOT NULL AND dead_lettered_at IS NULL AND payload = '{}'::jsonb AND lease_token IS NULL AND lease_expires_at IS NULL)
        OR (status = 'dead_letter' AND completed_at IS NULL AND dead_lettered_at IS NOT NULL AND payload = '{}'::jsonb AND lease_token IS NULL AND lease_expires_at IS NULL)
        OR (status = 'cancelled' AND completed_at IS NOT NULL AND dead_lettered_at IS NULL AND payload = '{}'::jsonb AND lease_token IS NULL AND lease_expires_at IS NULL)
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS outbox_commands_provider_idempotency_key_idx
  ON public.outbox_commands (provider_name, idempotency_key);

CREATE INDEX IF NOT EXISTS outbox_commands_claimable_idx
  ON public.outbox_commands (available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS outbox_commands_expired_lease_idx
  ON public.outbox_commands (lease_expires_at, created_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS outbox_commands_aggregate_idx
  ON public.outbox_commands (aggregate_type, aggregate_id, created_at);

CREATE INDEX IF NOT EXISTS outbox_commands_user_idx
  ON public.outbox_commands (user_id, created_at)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbox_commands_brand_idx
  ON public.outbox_commands (brand_id, created_at)
  WHERE brand_id IS NOT NULL;

ALTER TABLE public.outbox_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_commands FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  managed_comment constant text := 'venturecite outbox worker role managed by migration 0098';
  created_worker_role boolean := false;
  worker_role_oid oid;
  worker_role_record record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'venturecite_outbox_worker') THEN
    created_worker_role := true;
    CREATE ROLE venturecite_outbox_worker NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS VALID UNTIL 'infinity';
    COMMENT ON ROLE venturecite_outbox_worker IS 'venturecite outbox worker role managed by migration 0098';
  END IF;

  SELECT *
  INTO worker_role_record
  FROM pg_roles
  WHERE rolname = 'venturecite_outbox_worker';

  IF worker_role_record IS NULL THEN
    RAISE EXCEPTION 'venturecite_outbox_worker is not managed by migration 0098';
  END IF;
  worker_role_oid := worker_role_record.oid;

  IF shobj_description(worker_role_oid, 'pg_authid') IS DISTINCT FROM managed_comment THEN
    RAISE EXCEPTION 'venturecite_outbox_worker is not managed by migration 0098';
  END IF;

  IF worker_role_record.rolcanlogin
     OR worker_role_record.rolinherit
     OR worker_role_record.rolsuper
     OR worker_role_record.rolcreatedb
     OR worker_role_record.rolcreaterole
     OR worker_role_record.rolreplication
     OR worker_role_record.rolbypassrls
     OR worker_role_record.rolconfig IS NOT NULL THEN
    RAISE EXCEPTION 'venturecite_outbox_worker has unsafe role attributes';
  END IF;

  -- A new role has no grants yet. On every later run, reject drift before
  -- the migration can repair or hide it with REVOKE statements below.
  IF NOT created_worker_role THEN
    IF EXISTS (
      SELECT 1
      FROM pg_auth_members
      WHERE (
        roleid = worker_role_oid
        AND (
          member <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
          OR inherit_option
          OR set_option
          OR NOT admin_option
        )
      )
      OR member = worker_role_oid
    ) THEN
      RAISE EXCEPTION 'venturecite_outbox_worker has unexpected role memberships';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_namespace AS namespace
      CROSS JOIN LATERAL aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) AS privilege
      WHERE privilege.grantee = worker_role_oid
        AND NOT (
          namespace.nspname = 'public'
          AND privilege.privilege_type = 'USAGE'
          AND NOT privilege.is_grantable
        )
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_namespace AS namespace
      WHERE namespace.nspname = 'public'
        AND has_schema_privilege(worker_role_oid, namespace.oid, 'USAGE')
    ) OR EXISTS (
      SELECT 1
      FROM pg_namespace AS namespace
      WHERE namespace.nspname = 'public'
        AND has_schema_privilege(worker_role_oid, namespace.oid, 'CREATE')
    ) THEN
      RAISE EXCEPTION 'venturecite_outbox_worker has unexpected schema privileges';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS privilege
      WHERE privilege.grantee = worker_role_oid
        AND NOT (
          namespace.nspname = 'public'
          AND relation.relname = 'outbox_commands'
          AND relation.relkind IN ('r', 'p')
          AND privilege.privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
          AND NOT privilege.is_grantable
        )
    ) OR (
      SELECT count(*)
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS privilege
      WHERE privilege.grantee = worker_role_oid
        AND namespace.nspname = 'public'
        AND relation.relname = 'outbox_commands'
        AND relation.relkind IN ('r', 'p')
        AND privilege.privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
        AND NOT privilege.is_grantable
    ) <> 3 OR EXISTS (
      SELECT 1
      FROM pg_attribute AS column_definition
      JOIN pg_class AS relation ON relation.oid = column_definition.attrelid
      CROSS JOIN LATERAL aclexplode(column_definition.attacl) AS privilege
      WHERE privilege.grantee = worker_role_oid
        AND column_definition.attnum > 0
        AND NOT column_definition.attisdropped
    ) THEN
      RAISE EXCEPTION 'venturecite_outbox_worker has unexpected relation privileges';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
      WHERE privilege.grantee = worker_role_oid
    ) THEN
      RAISE EXCEPTION 'venturecite_outbox_worker has unexpected function privileges';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_database AS database_definition
      CROSS JOIN LATERAL aclexplode(coalesce(database_definition.datacl, acldefault('d', database_definition.datdba))) AS privilege
      WHERE privilege.grantee = worker_role_oid
    ) THEN
      RAISE EXCEPTION 'venturecite_outbox_worker has unexpected database privileges';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_type AS type_definition
      CROSS JOIN LATERAL aclexplode(coalesce(type_definition.typacl, acldefault('T', type_definition.typowner))) AS privilege
      WHERE privilege.grantee = worker_role_oid
    ) THEN
      RAISE EXCEPTION 'venturecite_outbox_worker has unexpected type privileges';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_namespace AS namespace
      WHERE namespace.nspowner = worker_role_oid
    ) OR EXISTS (
      SELECT 1
      FROM pg_class AS relation
      WHERE relation.relowner = worker_role_oid
    ) OR EXISTS (
      SELECT 1
      FROM pg_proc AS procedure
      WHERE procedure.proowner = worker_role_oid
    ) OR EXISTS (
      SELECT 1
      FROM pg_type AS type_definition
      WHERE type_definition.typowner = worker_role_oid
    ) THEN
      RAISE EXCEPTION 'venturecite_outbox_worker owns unexpected database objects';
    END IF;
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON TABLE public.outbox_commands FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.outbox_commands FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.outbox_commands FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.outbox_commands FROM venturecite_request;
REVOKE ALL PRIVILEGES ON TABLE public.outbox_commands FROM venturecite_content_request;
REVOKE ALL PRIVILEGES ON TABLE public.outbox_commands FROM venturecite_outbox_worker;
GRANT USAGE ON SCHEMA public TO venturecite_outbox_worker;
GRANT SELECT, INSERT, UPDATE ON TABLE public.outbox_commands TO venturecite_outbox_worker;

DROP POLICY IF EXISTS outbox_commands_worker_all ON public.outbox_commands;
CREATE POLICY outbox_commands_worker_all
  ON public.outbox_commands
  FOR ALL
  TO venturecite_outbox_worker
  USING (true)
  WITH CHECK (true);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.enqueue_outbox_command(
  p_kind TEXT, p_idempotency_key TEXT, p_aggregate_type TEXT, p_aggregate_id TEXT,
  p_user_id TEXT, p_brand_id TEXT, p_payload JSONB, p_payload_fingerprint TEXT,
  p_max_attempts INTEGER, p_provider_name TEXT, p_provider_operation TEXT, p_available_at TIMESTAMPTZ
) RETURNS TABLE (id TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, private AS $$
DECLARE
  existing_id TEXT;
  actor_id TEXT := nullif(btrim(current_setting('venturecite.user_id', true)), '');
  active_role TEXT := nullif(current_setting('role', true), 'none');
  required_role TEXT;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'outbox enqueue actor is required';
  END IF;

  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'outbox enqueue user is required';
  END IF;

  IF p_user_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'outbox user does not match request actor';
  END IF;

  required_role := CASE
    WHEN p_kind IN ('stripe.create_customer', 'resend.send_email', 'buffer.create_post')
      THEN 'venturecite_request'
    WHEN p_kind IN ('openai.create_response', 'content_cost.record')
      THEN 'venturecite_content_request'
    ELSE NULL
  END;
  IF required_role IS NULL
     OR active_role IS DISTINCT FROM required_role
     OR NOT pg_has_role(session_user, required_role, 'member') THEN
    RAISE EXCEPTION 'outbox enqueue caller is not authorized for this command kind';
  END IF;

  IF p_brand_id IS NULL
     AND p_kind NOT IN ('stripe.create_customer', 'resend.send_email') THEN
    RAISE EXCEPTION 'outbox brand is required for this command kind';
  END IF;
  IF p_brand_id IS NOT NULL AND btrim(p_brand_id) = '' THEN
    RAISE EXCEPTION 'outbox brand is required for this command kind';
  END IF;

  IF p_brand_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.brands WHERE brands.id = p_brand_id AND brands.user_id = p_user_id AND brands.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'outbox brand does not belong to request actor'; END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('stripe.create_customer', 'resend.send_email', 'buffer.create_post', 'openai.create_response', 'content_cost.record')
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR p_payload->>'kind' IS DISTINCT FROM p_kind OR p_max_attempts < 1 OR p_max_attempts > 100
     OR length(p_payload_fingerprint) <> 64
     OR NOT (CASE p_kind
       WHEN 'stripe.create_customer' THEN p_payload ? 'customerRequestId' AND p_payload - ARRAY['kind', 'customerRequestId'] = '{}'::jsonb AND jsonb_typeof(p_payload->'customerRequestId')='string' AND length(p_payload->>'customerRequestId') BETWEEN 1 AND 255
       WHEN 'resend.send_email' THEN p_payload ? 'emailIntentId' AND p_payload - ARRAY['kind', 'emailIntentId'] = '{}'::jsonb AND jsonb_typeof(p_payload->'emailIntentId')='string' AND length(p_payload->>'emailIntentId') BETWEEN 1 AND 255
       WHEN 'buffer.create_post' THEN p_payload ? 'publicationId' AND p_payload ? 'profileId' AND p_payload - ARRAY['kind', 'publicationId', 'profileId'] = '{}'::jsonb AND jsonb_typeof(p_payload->'publicationId')='string' AND jsonb_typeof(p_payload->'profileId')='string' AND length(p_payload->>'publicationId') BETWEEN 1 AND 255 AND length(p_payload->>'profileId') BETWEEN 1 AND 255
       WHEN 'openai.create_response' THEN p_payload ? 'contentJobId' AND p_payload ? 'inputReference' AND p_payload - ARRAY['kind', 'contentJobId', 'inputReference'] = '{}'::jsonb AND jsonb_typeof(p_payload->'contentJobId')='string' AND jsonb_typeof(p_payload->'inputReference')='string' AND length(p_payload->>'contentJobId') BETWEEN 1 AND 255 AND length(p_payload->>'inputReference') BETWEEN 1 AND 255
       WHEN 'content_cost.record' THEN p_payload ? 'contentJobId' AND p_payload ? 'providerResponseId' AND p_payload ? 'service' AND p_payload ? 'model' AND p_payload ? 'tokensIn' AND p_payload ? 'tokensOut' AND p_payload - ARRAY['kind', 'contentJobId', 'providerResponseId', 'service', 'model', 'tokensIn', 'tokensOut'] = '{}'::jsonb AND jsonb_typeof(p_payload->'contentJobId')='string' AND jsonb_typeof(p_payload->'providerResponseId')='string' AND jsonb_typeof(p_payload->'service')='string' AND length(p_payload->>'contentJobId') BETWEEN 1 AND 255 AND length(p_payload->>'providerResponseId') BETWEEN 1 AND 255 AND length(p_payload->>'service') BETWEEN 1 AND 255 AND (p_payload->'model'='null'::jsonb OR (jsonb_typeof(p_payload->'model')='string' AND length(p_payload->>'model') BETWEEN 1 AND 255)) AND jsonb_typeof(p_payload->'tokensIn')='number' AND (p_payload->>'tokensIn') ~ '^[0-9]+$' AND jsonb_typeof(p_payload->'tokensOut')='number' AND (p_payload->>'tokensOut') ~ '^[0-9]+$'
       ELSE false END) THEN RAISE EXCEPTION 'invalid outbox command'; END IF;
  INSERT INTO public.outbox_commands (kind,idempotency_key,aggregate_type,aggregate_id,user_id,brand_id,payload,payload_fingerprint,max_attempts,provider_name,provider_operation,available_at)
  VALUES (p_kind,p_idempotency_key,p_aggregate_type,p_aggregate_id,p_user_id,p_brand_id,p_payload,p_payload_fingerprint,p_max_attempts,p_provider_name,p_provider_operation,coalesce(p_available_at,now()))
  ON CONFLICT (provider_name,idempotency_key) DO NOTHING RETURNING outbox_commands.id INTO existing_id;
  IF existing_id IS NULL THEN
    SELECT command.id INTO existing_id FROM public.outbox_commands command
    WHERE command.provider_name=p_provider_name AND command.idempotency_key=p_idempotency_key
      AND command.kind=p_kind AND command.aggregate_type=p_aggregate_type AND command.aggregate_id=p_aggregate_id
      AND command.user_id IS NOT DISTINCT FROM p_user_id AND command.brand_id IS NOT DISTINCT FROM p_brand_id
      AND command.payload_fingerprint=p_payload_fingerprint AND command.max_attempts=p_max_attempts
      AND command.provider_operation=p_provider_operation;
    IF existing_id IS NULL THEN RAISE EXCEPTION 'outbox idempotency key conflicts with a different command'; END IF;
  END IF;
  RETURN QUERY SELECT existing_id;
END $$;
REVOKE ALL ON FUNCTION private.enqueue_outbox_command(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO venturecite_request, venturecite_content_request;
GRANT EXECUTE ON FUNCTION private.enqueue_outbox_command(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ) TO venturecite_request, venturecite_content_request;

CREATE OR REPLACE FUNCTION private.get_outbox_command(p_id TEXT) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, private AS $$
  SELECT to_jsonb(command) FROM public.outbox_commands command
  WHERE command.id = p_id
    AND command.user_id = nullif(current_setting('venturecite.user_id', true), '')
$$;
REVOKE ALL ON FUNCTION private.get_outbox_command(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_outbox_command(TEXT) TO venturecite_request, venturecite_content_request;
