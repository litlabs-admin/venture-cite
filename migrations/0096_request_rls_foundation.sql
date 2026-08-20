-- This migration adds an unused request role.
-- Do not connect application routes until the production role audit passes.

do $$
declare
  managed_comment constant text := 'venturecite request role managed by migration 0096';
  existing_comment text;
begin
  if not exists (select 1 from pg_roles where rolname = 'venturecite_request') then
    create role venturecite_request with
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
    comment on role venturecite_request is 'venturecite request role managed by migration 0096';
  else
    select shobj_description(oid, 'pg_authid')
    into existing_comment
    from pg_roles
    where rolname = 'venturecite_request';

    if existing_comment is distinct from managed_comment then
      raise exception 'venturecite_request is not managed by migration 0096';
    end if;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_roles
    where rolname = 'venturecite_request'
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
    raise exception 'venturecite_request has unsafe role attributes';
  end if;

  if exists (
    select 1
    from pg_auth_members
    where (
        roleid = (select oid from pg_roles where rolname = 'venturecite_request')
        and (
          member <> (select oid from pg_roles where rolname = current_user)
          or inherit_option
          or set_option
          or not admin_option
        )
      )
       or member = (select oid from pg_roles where rolname = 'venturecite_request')
  ) then
    raise exception 'venturecite_request has unexpected role memberships';
  end if;

  if exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner)))
      as privilege
    where privilege.grantee = (select oid from pg_roles where rolname = 'venturecite_request')
      and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      and not (
        namespace.nspname = 'public'
        and relation.relname in ('users', 'brands')
      )
  ) then
    raise exception 'venturecite_request has privileges outside users and brands';
  end if;

  if exists (
    select 1
    from pg_attribute as column_definition
    join pg_class as relation on relation.oid = column_definition.attrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(column_definition.attacl)
      as privilege
    where privilege.grantee = (select oid from pg_roles where rolname = 'venturecite_request')
      and column_definition.attnum > 0
      and not column_definition.attisdropped
      and not (
        namespace.nspname = 'public'
        and relation.relname in ('users', 'brands')
      )
  ) then
    raise exception 'venturecite_request has column privileges outside users and brands';
  end if;
end
$$;

grant usage on schema public to venturecite_request;

revoke all privileges on public.users, public.brands from venturecite_request;

do $$
declare
  column_record record;
begin
  for column_record in
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('users', 'brands')
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on table %2$I.%3$I from venturecite_request',
      column_record.column_name,
      column_record.table_schema,
      column_record.table_name
    );
  end loop;
end
$$;

grant select (
  id,
  email,
  first_name,
  last_name,
  timezone,
  profile_image_url,
  access_tier,
  trial_ends_at,
  is_admin,
  weekly_report_enabled,
  onboarding_state,
  deleted_at
) on public.users to venturecite_request;

grant update (
  first_name,
  last_name,
  timezone,
  profile_image_url,
  weekly_report_enabled,
  onboarding_state
) on public.users to venturecite_request;

grant select (
  id,
  user_id,
  name,
  company_name,
  industry,
  fact_scrape_enabled,
  description,
  website,
  tone,
  target_audience,
  products,
  key_values,
  unique_selling_points,
  brand_voice,
  sample_content,
  name_variations,
  logo_url,
  auto_citation_schedule,
  auto_citation_day,
  auto_citation_hour,
  auto_citation_active,
  version,
  monitor_mentions,
  deleted_at,
  created_at,
  updated_at
) on public.brands to venturecite_request;

grant insert (
  user_id,
  name,
  company_name,
  industry,
  fact_scrape_enabled,
  description,
  website,
  tone,
  target_audience,
  products,
  key_values,
  unique_selling_points,
  brand_voice,
  sample_content,
  name_variations,
  logo_url
) on public.brands to venturecite_request;

grant update (
  name,
  company_name,
  industry,
  fact_scrape_enabled,
  description,
  website,
  tone,
  target_audience,
  products,
  key_values,
  unique_selling_points,
  brand_voice,
  sample_content,
  name_variations,
  logo_url,
  auto_citation_schedule,
  auto_citation_day,
  auto_citation_hour,
  auto_citation_active,
  monitor_mentions,
  updated_at,
  version
) on public.brands to venturecite_request;

drop policy if exists users_request_select on public.users;
create policy users_request_select
  on public.users
  for select
  to venturecite_request
  using (
    id = (select nullif(current_setting('venturecite.user_id', true), ''))
  );

drop policy if exists users_request_update on public.users;
create policy users_request_update
  on public.users
  for update
  to venturecite_request
  using (
    id = (select nullif(current_setting('venturecite.user_id', true), ''))
  )
  with check (
    id = (select nullif(current_setting('venturecite.user_id', true), ''))
  );

drop policy if exists brands_request_select on public.brands;
create policy brands_request_select
  on public.brands
  for select
  to venturecite_request
  using (
    user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
  );

drop policy if exists brands_request_insert on public.brands;
create policy brands_request_insert
  on public.brands
  for insert
  to venturecite_request
  with check (
    user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
  );

drop policy if exists brands_request_update on public.brands;
create policy brands_request_update
  on public.brands
  for update
  to venturecite_request
  using (
    user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
  )
  with check (
    user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
  );

drop policy if exists brands_request_delete on public.brands;
