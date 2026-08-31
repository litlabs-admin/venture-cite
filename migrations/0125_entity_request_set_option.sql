-- Let the application connection SET ROLE into venturecite_entity_request.
--
-- Migration 0124 created that role and nine SELECT policies for it, and its own
-- header describes the intent: a future route does
-- `SET LOCAL ROLE venturecite_entity_request` and reads the nine
-- loadEntityThroughBrand tables through the policies, as a second layer
-- independent of ownership.ts.
--
-- That is not currently possible. PostgreSQL 16+ requires the membership to
-- carry the SET option, and 0124 grants none, so the role is created and
-- immediately unusable:
--
--   SET LOCAL ROLE venturecite_entity_request
--   ERROR:  42501: permission denied to set role "venturecite_entity_request"
--
-- Verified against production on 2026-08-31: venturecite_entity_request has one
-- membership row, admin_option true, set_option FALSE, while the three roles
-- 0112 covers each carry a second row with set_option TRUE.
--
-- This is the same grant 0112 confers, applied to the role 0124 added. 0112
-- predates that role and lists only venturecite_request,
-- venturecite_content_request and venturecite_outbox_worker.
--
-- Shape matches 0112 exactly: ADMIN FALSE, INHERIT FALSE, SET TRUE. INHERIT
-- FALSE matters - the connection must not silently acquire the role's
-- privileges, only be able to assume it deliberately inside a transaction.
--
-- Granting to current_user, as 0112 does, ties the grant to whichever role
-- applies migrations. The GRANT is issued from inside plpgsql with format(%I)
-- rather than as a literal `GRANT ... TO current_user`, because the literal
-- form segfaults PostgreSQL 17.6 (reproduced locally 2026-08-30; see the
-- beforeAll of tests/integration/rlsDefenceInDepth.test.ts).
--
-- Idempotent: re-running finds the self-grant already present and does nothing.

DO $$
DECLARE
  role_name CONSTANT text := 'venturecite_entity_request';
  self_grant_count bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
    RAISE EXCEPTION '% does not exist; migration 0124 must run first', role_name;
  END IF;

  -- Refuse to hand SET on a role that has picked up unsafe attributes since
  -- 0124 created it. Assuming a NOBYPASSRLS, NOLOGIN role is the whole point;
  -- assuming one that can log in or bypass RLS would be a privilege gain.
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = role_name
      AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole
           OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION '% has unsafe role attributes', role_name;
  END IF;

  SELECT count(*)
  INTO self_grant_count
  FROM pg_auth_members AS membership
  JOIN pg_roles AS granted ON granted.oid = membership.roleid
  JOIN pg_roles AS member ON member.oid = membership.member
  WHERE granted.rolname = role_name
    AND member.rolname = current_user
    AND membership.grantor = member.oid;

  IF self_grant_count = 0 THEN
    EXECUTE format(
      'GRANT %I TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE',
      role_name,
      current_user
    );
  END IF;
END
$$;
