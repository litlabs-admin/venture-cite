-- Source: migrations/0111_revoke_handle_new_user_execute_after_function_replace.sql
-- SHA256: 4dd95844a91d2ea6121733985b599f1c17ad306def40d4bd8c83788f752bf8e4

-- Revoke Data API execution after migrations that replace the trigger function.
--
-- Migration 0093 replaced public.handle_new_user(). PostgreSQL can restore the
-- default PUBLIC EXECUTE grant when a function definition is replaced. This
-- function runs only from the auth.users trigger and must not be an RPC.
--
-- The revoke is idempotent. Trigger execution does not require API EXECUTE.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
