-- Revoke public EXECUTE on public.handle_new_user().
--
-- 2026-06-28 Supabase Security Advisor flagged
-- `anon_security_definer_function_executable` /
-- `authenticated_security_definer_function_executable`: the function is
-- SECURITY DEFINER and lives in `public`, so Postgres' default
-- `GRANT EXECUTE ... TO PUBLIC` makes it a callable RPC endpoint at
-- /rest/v1/rpc/handle_new_user for both the anon and authenticated roles
-- (both inherit from PUBLIC). A definer function runs with owner
-- privileges, so this is an unauthenticated way to poke at public.users.
--
-- handle_new_user is a TRIGGER function only (on_auth_user_created on
-- auth.users, see 0075). Triggers invoke the function as the table owner
-- regardless of EXECUTE grants, so revoking EXECUTE from the API roles
-- closes the RPC hole and breaks nothing - no app code calls it via .rpc()
-- (client uses Supabase for auth only; see 0081).
--
-- Idempotent: REVOKE on an absent grant is a no-op, safe to re-run.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
