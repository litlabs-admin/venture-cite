-- Content request-role access for the content slice.
--
-- The application owner continues to run workers. This role only supports
-- user requests inside a transaction that sets venturecite.user_id.

do $$
declare
  managed_comment constant text := 'venturecite content request role managed by migration 0097';
  existing_comment text;
begin
  if not exists (select 1 from pg_roles where rolname = 'venturecite_content_request') then
    create role venturecite_content_request with
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
    comment on role venturecite_content_request is
      'venturecite content request role managed by migration 0097';
  else
    select shobj_description(oid, 'pg_authid')
    into existing_comment
    from pg_roles
    where rolname = 'venturecite_content_request';

    if existing_comment is distinct from managed_comment then
      raise exception 'venturecite_content_request is not managed by migration 0097';
    end if;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_roles
    where rolname = 'venturecite_content_request'
      and (
        rolcanlogin
        or rolinherit
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception 'venturecite_content_request has unsafe role attributes';
  end if;

  if exists (
    select 1
    from pg_auth_members
    where (
        roleid = (select oid from pg_roles where rolname = 'venturecite_content_request')
        and (
          member <> (select oid from pg_roles where rolname = current_user)
          or inherit_option
          or set_option
          or not admin_option
        )
      )
       or member = (select oid from pg_roles where rolname = 'venturecite_content_request')
  ) then
    raise exception 'venturecite_content_request has unexpected role memberships';
  end if;

  if exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner)))
      as privilege
    where privilege.grantee = (select oid from pg_roles where rolname = 'venturecite_content_request')
      and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      and not (
        namespace.nspname = 'public'
        and relation.relname in (
          'brands',
          'articles',
          'article_revisions',
          'distributions',
          'keyword_research',
          'content_generation_jobs'
        )
      )
  ) then
    raise exception 'venturecite_content_request has privileges outside the content slice';
  end if;

  if exists (
    select 1
    from pg_attribute as column_definition
    join pg_class as relation on relation.oid = column_definition.attrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(column_definition.attacl) as privilege
    where privilege.grantee = (select oid from pg_roles where rolname = 'venturecite_content_request')
      and column_definition.attnum > 0
      and not column_definition.attisdropped
      and not (
        namespace.nspname = 'public'
        and relation.relname in (
          'brands',
          'articles',
          'article_revisions',
          'distributions',
          'keyword_research',
          'content_generation_jobs'
        )
      )
  ) then
    raise exception 'venturecite_content_request has column privileges outside the content slice';
  end if;
end
$$;

grant usage on schema public to venturecite_content_request;

alter table public.brands enable row level security;
alter table public.articles enable row level security;
alter table public.article_revisions enable row level security;
alter table public.distributions enable row level security;
alter table public.keyword_research enable row level security;
alter table public.content_generation_jobs enable row level security;

create index if not exists content_gen_jobs_brand_id_idx
  on public.content_generation_jobs (brand_id);

create index if not exists content_gen_jobs_article_id_idx
  on public.content_generation_jobs (article_id);

create index if not exists keyword_research_article_id_idx
  on public.keyword_research (article_id);

revoke all privileges on public.brands,
  public.articles,
  public.article_revisions,
  public.distributions,
  public.keyword_research,
  public.content_generation_jobs
  from venturecite_content_request;

do $$
declare
  column_record record;
begin
  for column_record in
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'brands',
        'articles',
        'article_revisions',
        'distributions',
        'keyword_research',
        'content_generation_jobs'
      )
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on table %2$I.%3$I from venturecite_content_request',
      column_record.column_name,
      column_record.table_schema,
      column_record.table_name
    );
  end loop;
end
$$;

grant select (id, user_id, deleted_at) on public.brands to venturecite_content_request;

grant select (
  id, brand_id, title, content, excerpt, meta_description, keywords, industry,
  content_type, featured_image, author, view_count, version, status, job_id,
  target_customers, geography, content_style, external_url, ai_generated,
  created_at, updated_at, seo_data
) on public.articles to venturecite_content_request;

grant select (id, article_id, content, source, created_by, created_at)
  on public.article_revisions to venturecite_content_request;

grant select (id, article_id, platform, status, distributed_at, metadata, created_at)
  on public.distributions to venturecite_content_request;

grant select (
  id, brand_id, keyword, search_volume, difficulty, opportunity_score,
  ai_citation_potential, intent, category, competitor_gap,
  suggested_content_type, related_keywords, status, provenance,
  content_generated, article_id, discovered_at, updated_at
) on public.keyword_research to venturecite_content_request;

grant select (
  id, brand_id, status, request_payload, article_id, error_message, error_kind,
  created_at, started_at, completed_at
) on public.content_generation_jobs to venturecite_content_request;

drop policy if exists brands_content_request_select on public.brands;
drop policy if exists brands_content_select on public.brands;
create policy brands_content_select
  on public.brands
  for select
  to venturecite_content_request
  using (
    user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
    and deleted_at is null
  );

drop policy if exists articles_content_request_select on public.articles;
create policy articles_content_request_select
  on public.articles
  for select
  to venturecite_content_request
  using (
    exists (
      select 1
      from public.brands
      where brands.id = articles.brand_id
        and brands.user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
    )
  );

drop policy if exists articles_content_request_insert on public.articles;
drop policy if exists articles_content_request_update on public.articles;
drop policy if exists articles_content_request_delete on public.articles;

drop policy if exists article_revisions_content_request_select on public.article_revisions;
create policy article_revisions_content_request_select
  on public.article_revisions
  for select
  to venturecite_content_request
  using (
    exists (
      select 1
      from public.articles
      join public.brands on brands.id = articles.brand_id
      where articles.id = article_revisions.article_id
        and brands.user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
    )
  );

drop policy if exists article_revisions_content_request_insert on public.article_revisions;

drop policy if exists distributions_content_request_select on public.distributions;
create policy distributions_content_request_select
  on public.distributions
  for select
  to venturecite_content_request
  using (
    exists (
      select 1
      from public.articles
      join public.brands on brands.id = articles.brand_id
      where articles.id = distributions.article_id
        and brands.user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
    )
  );

drop policy if exists distributions_content_request_insert on public.distributions;
drop policy if exists distributions_content_request_update on public.distributions;

drop policy if exists keyword_research_content_request_select on public.keyword_research;
create policy keyword_research_content_request_select
  on public.keyword_research
  for select
  to venturecite_content_request
  using (
    exists (
      select 1
      from public.brands
      where brands.id = keyword_research.brand_id
        and brands.user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
    )
  );

drop policy if exists keyword_research_content_request_update on public.keyword_research;
drop policy if exists keyword_research_content_request_delete on public.keyword_research;

drop policy if exists content_generation_jobs_content_request_select on public.content_generation_jobs;
create policy content_generation_jobs_content_request_select
  on public.content_generation_jobs
  for select
  to venturecite_content_request
  using (
    user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
    and exists (
      select 1
      from public.brands
      where brands.id = content_generation_jobs.brand_id
        and brands.user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
        and brands.deleted_at is null
    )
    and exists (
      select 1
      from public.articles
      join public.brands on brands.id = articles.brand_id
      where articles.id = content_generation_jobs.article_id
        and articles.brand_id = content_generation_jobs.brand_id
        and brands.user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
        and brands.deleted_at is null
    )
  );

drop policy if exists content_generation_jobs_content_request_insert on public.content_generation_jobs;
