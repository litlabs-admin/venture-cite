-- Source: migrations/0120_revoke_data_api_grants.sql
-- SHA256: 34eb3b43a381777c110112217509663093dba17573fa74c43f1914f614a0090a

-- The application does not use PostgREST or the Supabase Data API for table
-- access. Every business query uses Drizzle over DATABASE_URL, but default
-- table creation grants left anon and authenticated access across public.
--
-- RLS with no policies is only one mistake away from exposure. A permissive
-- policy or disabled RLS would make those default grants usable by browser
-- clients that hold the anon key.
--
-- This does not affect service_role, the restricted venturecite_* roles, or
-- the owner connection that the application uses. Re-grant access explicitly
-- if the application adopts the Data API in the future.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- New tables must not silently reintroduce the grants.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
