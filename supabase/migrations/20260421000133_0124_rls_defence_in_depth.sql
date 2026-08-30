-- Source: migrations/0124_rls_defence_in_depth.sql
-- SHA256: 7807d0294b9d97734f538d7cdacd0e0c0e36f004524f297579d7ed407263214d

-- RLS defence-in-depth, phase B7.
--
-- Part 1: job_leases is the only public table that never received RLS.
-- Every other table either got it in bulk from 0081 or turned it on in its
-- own creation migration (0087, 0088, 0094-0099, 0102, 0116). job_leases
-- (0119) holds a distributed-lock row (lease_key, holder_token, expiry) with
-- no user or brand column - it is not tenant data - but leaving RLS off
-- breaks the "every public table has RLS" invariant the Supabase Security
-- Advisor checks (rls_disabled_in_public). No policy is added: the only
-- writer is the application's owner-equivalent connection, which RLS does
-- not restrict, and 0120 already revoked all anon/authenticated grants on
-- every table (including this one, via ALTER DEFAULT PRIVILEGES). Enabling
-- RLS with zero policies here is the same default-deny shape 0081 used and
-- changes no legitimate access path.
ALTER TABLE public.job_leases ENABLE ROW LEVEL SECURITY;

-- Part 2: nine tenant-scoped tables from server/lib/ownership.ts's
-- loadEntityThroughBrand (see .audit/B7/B7-01-tenant-isolation-tests.md)
-- have had RLS enabled with zero policies since 0081. That makes RLS a
-- no-op for them today: the application reads and writes these tables over
-- the owner-equivalent DATABASE_URL connection, which bypasses RLS
-- regardless of policy, and none of these nine routes has been migrated to
-- an actor-bound repository the way articles/distributions/keyword_research
-- were in 0096/0097/0104/0105.
--
-- This does NOT reuse venturecite_content_request. That role's own
-- self-check (0097_request_rls_content.sql: "venturecite_content_request
-- has privileges outside the content slice") deliberately raises an
-- exception the moment its grants extend past its six-table content-
-- generation slice {brands, articles, article_revisions, distributions,
-- keyword_research, content_generation_jobs} - confirmed by actually
-- running it: granting these nine tables to venturecite_content_request and
-- replaying 0097 (which every full migration run does, exercised by
-- tests/integration/contentRequestRls.test.ts) throws exactly that
-- exception. These nine tables are a different domain (competitive/content
-- signals, not the content-generation pipeline), so this migration creates
-- a new role, venturecite_entity_request, with the same defensive shape
-- 0096/0097 use for their roles: safe attributes, an exclusive-membership
-- check, and a privilege allow-list scoped to exactly this migration's nine
-- tables, so a future migration cannot silently widen this role's reach
-- either.
--
-- This migration adds the read-side policy ahead of any route migration to
-- an actor-bound repository, the same order 0096 used for venturecite_request
-- ("This migration adds an unused request role. Do not connect application
-- routes until the production role audit passes."). Until a route SET LOCAL
-- ROLEs into venturecite_entity_request to read one of these nine tables,
-- the policy below is dormant and changes nothing for the application's
-- current connection. It becomes a real second layer - independent of
-- ownership.ts's loadEntityThroughBrand - only once that route migration
-- happens; that migration is out of scope here and is not implied to be done.
--
-- Shape: SELECT-only (loadEntityThroughBrand only ever reads), scoped by an
-- EXISTS join to the owning brand, matching keyword_research's policy in
-- 0099/0113 exactly, including the `(select current_setting(...))` InitPlan
-- wrapper - a bare current_setting() call here would evaluate per row
-- instead of once per statement. Column grants are full-row:
-- loadEntityThroughBrand does `select()` (no column list), so a narrower
-- grant would not actually mirror the check it replicates.

DO $$
DECLARE
  managed_comment CONSTANT text := 'venturecite entity request role managed by migration 0124';
  existing_comment text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'venturecite_entity_request') THEN
    CREATE ROLE venturecite_entity_request WITH
      NOLOGIN
      NOINHERIT
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
    COMMENT ON ROLE venturecite_entity_request IS
      'venturecite entity request role managed by migration 0124';
  ELSE
    SELECT shobj_description(oid, 'pg_authid')
    INTO existing_comment
    FROM pg_roles
    WHERE rolname = 'venturecite_entity_request';

    IF existing_comment IS DISTINCT FROM managed_comment THEN
      RAISE EXCEPTION 'venturecite_entity_request is not managed by migration 0124';
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'venturecite_entity_request'
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
    RAISE EXCEPTION 'venturecite_entity_request has unsafe role attributes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner)))
      AS privilege
    WHERE privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'venturecite_entity_request')
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND NOT (
        namespace.nspname = 'public'
        AND relation.relname IN (
          'competitors',
          'faq_items',
          'listicles',
          'bofu_content',
          'brand_hallucinations',
          'brand_fact_sheet',
          'brand_mentions',
          'community_posts',
          'citation_quality'
        )
      )
  ) THEN
    RAISE EXCEPTION 'venturecite_entity_request has privileges outside its entity-read slice';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO venturecite_entity_request;

-- Every policy below joins to brands to check ownership. The executing role
-- needs its own SELECT privilege on the columns that join uses - a policy's
-- USING clause does not implicitly borrow privileges from anywhere else.
-- Same three columns 0097 granted venturecite_content_request for the same
-- reason. brands also has RLS enabled with no policy for this role yet, so
-- without a policy here the EXISTS join below would see zero brand rows for
-- ANY caller, making every entity policy fail closed unconditionally - not
-- "safe", just useless. This policy grants venturecite_entity_request the
-- same read of brands that venturecite_content_request already has via
-- brands_content_select in 0097.
GRANT SELECT (id, user_id, deleted_at) ON public.brands TO venturecite_entity_request;
DROP POLICY IF EXISTS brands_entity_request_select ON public.brands;
CREATE POLICY brands_entity_request_select
  ON public.brands
  FOR SELECT
  TO venturecite_entity_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND deleted_at IS NULL
  );

GRANT SELECT ON public.competitors TO venturecite_entity_request;
DROP POLICY IF EXISTS competitors_entity_request_select ON public.competitors;
CREATE POLICY competitors_entity_request_select
  ON public.competitors
  FOR SELECT
  TO venturecite_entity_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = competitors.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.faq_items TO venturecite_entity_request;
DROP POLICY IF EXISTS faq_items_entity_request_select ON public.faq_items;
CREATE POLICY faq_items_entity_request_select
  ON public.faq_items
  FOR SELECT
  TO venturecite_entity_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = faq_items.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.listicles TO venturecite_entity_request;
DROP POLICY IF EXISTS listicles_entity_request_select ON public.listicles;
CREATE POLICY listicles_entity_request_select
  ON public.listicles
  FOR SELECT
  TO venturecite_entity_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = listicles.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.bofu_content TO venturecite_entity_request;
DROP POLICY IF EXISTS bofu_content_entity_request_select ON public.bofu_content;
CREATE POLICY bofu_content_entity_request_select
  ON public.bofu_content
  FOR SELECT
  TO venturecite_entity_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = bofu_content.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.brand_hallucinations TO venturecite_entity_request;
DROP POLICY IF EXISTS brand_hallucinations_entity_request_select ON public.brand_hallucinations;
CREATE POLICY brand_hallucinations_entity_request_select
  ON public.brand_hallucinations
  FOR SELECT
  TO venturecite_entity_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_hallucinations.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.brand_fact_sheet TO venturecite_entity_request;
DROP POLICY IF EXISTS brand_fact_sheet_entity_request_select ON public.brand_fact_sheet;
CREATE POLICY brand_fact_sheet_entity_request_select
  ON public.brand_fact_sheet
  FOR SELECT
  TO venturecite_entity_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_fact_sheet.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.brand_mentions TO venturecite_entity_request;
DROP POLICY IF EXISTS brand_mentions_entity_request_select ON public.brand_mentions;
CREATE POLICY brand_mentions_entity_request_select
  ON public.brand_mentions
  FOR SELECT
  TO venturecite_entity_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_mentions.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.community_posts TO venturecite_entity_request;
DROP POLICY IF EXISTS community_posts_entity_request_select ON public.community_posts;
CREATE POLICY community_posts_entity_request_select
  ON public.community_posts
  FOR SELECT
  TO venturecite_entity_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = community_posts.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.citation_quality TO venturecite_entity_request;
DROP POLICY IF EXISTS citation_quality_entity_request_select ON public.citation_quality;
CREATE POLICY citation_quality_entity_request_select
  ON public.citation_quality
  FOR SELECT
  TO venturecite_entity_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = citation_quality.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );
