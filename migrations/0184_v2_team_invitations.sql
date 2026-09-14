-- Pending seat invitations for the /v2/settings/team screen.
--
-- This app has no multi-user membership table: a brand's only real member is
-- its owner (brands.user_id). This table records invitation intent only - it
-- grants nothing by itself. Follows the request-role RLS pattern from
-- migrations 0131 (table + RLS + policies), 0132, 0139 and 0140 (reader
-- grants).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'venturecite_request'
  ) THEN
    RAISE EXCEPTION 'venturecite_request must be created by migration 0096 first';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'venturecite_request'
      AND (
        rolcanlogin
        OR rolinherit
        OR rolsuper
        OR rolcreatedb
        OR rolcreaterole
        OR rolreplication
        OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'venturecite_request has unsafe role attributes';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.v2_team_invitations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT v2_team_invitations_role_check
    CHECK (role IN ('editor', 'analyst', 'viewer')),
  CONSTRAINT v2_team_invitations_status_check
    CHECK (status IN ('pending', 'revoked', 'accepted')),
  -- Re-inviting after a revoke is fine (new row, same email, status
  -- 'pending'); a second concurrent pending invite to the same address is
  -- not.
  CONSTRAINT v2_team_invitations_owner_email_status_uq
    UNIQUE (owner_user_id, email, status)
);

CREATE INDEX IF NOT EXISTS v2_team_invitations_owner_idx
  ON public.v2_team_invitations (owner_user_id, created_at DESC);

ALTER TABLE public.v2_team_invitations ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO venturecite_request;

REVOKE ALL PRIVILEGES ON TABLE public.v2_team_invitations FROM venturecite_request;
GRANT SELECT, INSERT, UPDATE ON TABLE public.v2_team_invitations TO venturecite_request;

-- The application currently sets venturecite.user_id. app.user_id is also
-- accepted for direct role tests and future request context migration (see
-- migration 0132).
DROP POLICY IF EXISTS v2_team_invitations_request_select ON public.v2_team_invitations;
CREATE POLICY v2_team_invitations_request_select
  ON public.v2_team_invitations
  FOR SELECT
  TO venturecite_request
  USING (
    owner_user_id = nullif(
      coalesce(
        nullif((select current_setting('app.user_id', true)), ''),
        nullif((select current_setting('venturecite.user_id', true)), '')
      ),
      ''
    )
  );

DROP POLICY IF EXISTS v2_team_invitations_request_insert ON public.v2_team_invitations;
CREATE POLICY v2_team_invitations_request_insert
  ON public.v2_team_invitations
  FOR INSERT
  TO venturecite_request
  WITH CHECK (
    owner_user_id = nullif(
      coalesce(
        nullif((select current_setting('app.user_id', true)), ''),
        nullif((select current_setting('venturecite.user_id', true)), '')
      ),
      ''
    )
  );

DROP POLICY IF EXISTS v2_team_invitations_request_update ON public.v2_team_invitations;
CREATE POLICY v2_team_invitations_request_update
  ON public.v2_team_invitations
  FOR UPDATE
  TO venturecite_request
  USING (
    owner_user_id = nullif(
      coalesce(
        nullif((select current_setting('app.user_id', true)), ''),
        nullif((select current_setting('venturecite.user_id', true)), '')
      ),
      ''
    )
  )
  WITH CHECK (
    owner_user_id = nullif(
      coalesce(
        nullif((select current_setting('app.user_id', true)), ''),
        nullif((select current_setting('venturecite.user_id', true)), '')
      ),
      ''
    )
  );
