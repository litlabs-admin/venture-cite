-- Source: migrations/0081_enable_rls_all_public_tables.sql
-- SHA256: a85d1338f70362d1149c80fe26b901d4cf7c91b2e30b888a66e1afac18a24740

-- Enable Row-Level Security on every table in the `public` schema.
--
-- 2026-06-02 Supabase Security Advisor flagged `rls_disabled_in_public`:
-- public tables with RLS off are reachable through the PostgREST data API
-- (https://<project>.supabase.co/rest/v1/<table>) using the *anon* key,
-- which we ship to every browser for auth. With RLS off, anyone holding
-- that public key can read/write our tables directly, bypassing the
-- Express API.
--
-- Why "enable, no policies" is the correct fix for this codebase:
--
--   * The client (client/src/lib/supabase.ts) uses Supabase ONLY for auth.
--     There is no supabase.from()/.rpc() anywhere - no app code reads tables
--     through the anon PostgREST path, so locking it shut breaks nothing.
--
--   * All table I/O goes through Drizzle over the direct Postgres pool
--     (server/db.ts, DATABASE_URL → Supabase pooler). That role is the table
--     owner and is NOT subject to RLS (we deliberately do NOT FORCE RLS, so
--     the owner connection keeps full access).
--
--   * server/supabase.ts (supabaseAdmin) is service-role keyed - it has
--     BYPASSRLS and is used only for auth.* calls, never table reads.
--
-- RLS enabled with zero policies = default-deny for the anon/authenticated
-- roles, which is exactly what the advisor wants. We intentionally do NOT
-- add policies: granting anon/authenticated any direct table access would
-- re-open the very hole we're closing.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op on tables that already
-- have it, so re-running this migration is safe.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'          -- ordinary tables only (skip views, etc.)
      AND c.relrowsecurity = false -- only those still missing RLS
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    RAISE NOTICE 'RLS enabled on public.%', r.tablename;
  END LOOP;
END $$;
