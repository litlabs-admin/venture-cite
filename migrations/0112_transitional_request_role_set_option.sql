-- Temporarily allow the current application connection to enter restricted roles.
-- Revoke this membership option after DATABASE_URL uses venturecite_runtime.
-- The original admin membership remains separate from the safe self-grant.

DO $$
DECLARE
  role_name text;
  original_admin_count bigint;
  self_grant_count bigint;
  safe_self_grant_count bigint;
  membership_count bigint;
  reverse_membership_count bigint;
  restricted_roles CONSTANT text[] := ARRAY[
    'venturecite_request',
    'venturecite_content_request',
    'venturecite_outbox_worker'
  ];
BEGIN
  FOREACH role_name IN ARRAY restricted_roles LOOP
    SELECT count(*)
    INTO reverse_membership_count
    FROM pg_auth_members AS auth_membership
    JOIN pg_roles AS member_role ON member_role.oid = auth_membership.member
    WHERE member_role.rolname = role_name;

    IF reverse_membership_count <> 0 THEN
      RAISE EXCEPTION '% is a member of another role', role_name;
    END IF;

    SELECT
      count(*) FILTER (
        WHERE auth_membership.grantor <> member_role.oid
          AND auth_membership.admin_option
          AND NOT auth_membership.inherit_option
          AND NOT auth_membership.set_option
      ),
      count(*) FILTER (WHERE auth_membership.grantor = member_role.oid),
      count(*) FILTER (
        WHERE auth_membership.grantor = member_role.oid
          AND NOT auth_membership.admin_option
          AND NOT auth_membership.inherit_option
          AND auth_membership.set_option
      ),
      count(*)
    INTO original_admin_count, self_grant_count, safe_self_grant_count, membership_count
    FROM pg_auth_members AS auth_membership
    JOIN pg_roles AS granted_role ON granted_role.oid = auth_membership.roleid
    JOIN pg_roles AS member_role ON member_role.oid = auth_membership.member
    WHERE granted_role.rolname = role_name
      AND member_role.rolname = current_user;

    IF original_admin_count <> 1
       OR self_grant_count > 1
       OR safe_self_grant_count <> self_grant_count
       OR membership_count <> original_admin_count + self_grant_count THEN
      RAISE EXCEPTION '% has unsafe current-connection membership rows', role_name;
    END IF;

    IF self_grant_count = 0 THEN
      EXECUTE format(
        'GRANT %I TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE',
        role_name,
        current_user
      );
    END IF;
  END LOOP;
END
$$;
