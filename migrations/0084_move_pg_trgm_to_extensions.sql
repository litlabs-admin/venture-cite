-- Move pg_trgm out of the public schema into the dedicated `extensions`
-- schema (Supabase's canonical location for extensions).
--
-- 2026-06-28 Supabase Security Advisor flagged `extension_in_public`:
-- 0042 ran `CREATE EXTENSION IF NOT EXISTS pg_trgm` with no schema, so it
-- landed in `public`. Extensions in `public` clutter the PostgREST-exposed
-- namespace and their functions become anon/authenticated RPC endpoints
-- (e.g. /rest/v1/rpc/similarity). Supabase ships an `extensions` schema for
-- exactly this; keep extensions there.
--
-- Edge cases handled:
--   * Idempotent + re-runnable: only moves if pg_trgm currently lives in
--     public; a no-op if already moved or not installed (0042 treats
--     pg_trgm as best-effort, so it may be absent on some environments).
--   * The faq_items trigram GIN index (0042) depends on gin_trgm_ops by
--     OID, and that operator class is a member of the extension, so it
--     relocates with the extension automatically - no index rebuild, no
--     downtime, the index keeps working.
--   * The one runtime caller (databaseStorage.findSimilarFaqQuestion) is
--     schema-qualified to `extensions.similarity(...)` in app code, so it
--     resolves regardless of the connection role's search_path (Supabase's
--     default is `"$user", public`, which does NOT include extensions).
--
-- This migration runs after 0042 on every boot, so on a freshly migrated
-- database pg_trgm is in `extensions` before the app serves a request.

create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm'
      and n.nspname = 'public'
  ) then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end
$$;
