-- Permit the actor-bound brand deletion preview to count its child rows.
-- This migration grants read access only to the required foreign key.

revoke all privileges on public.brand_prompts, public.citation_runs
from venturecite_content_request;

grant select (brand_id)
  on public.brand_prompts to venturecite_content_request;

grant select (brand_id)
  on public.citation_runs to venturecite_content_request;

alter table public.brand_prompts enable row level security;
alter table public.citation_runs enable row level security;

drop policy if exists brand_prompts_content_request_select on public.brand_prompts;
create policy brand_prompts_content_request_select
  on public.brand_prompts
  for select
  to venturecite_content_request
  using (
    exists (
      select 1
      from public.brands
      where brands.id = brand_prompts.brand_id
        and brands.user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
        and brands.deleted_at is null
    )
  );

drop policy if exists citation_runs_content_request_select on public.citation_runs;
create policy citation_runs_content_request_select
  on public.citation_runs
  for select
  to venturecite_content_request
  using (
    exists (
      select 1
      from public.brands
      where brands.id = citation_runs.brand_id
        and brands.user_id = (select nullif(current_setting('venturecite.user_id', true), ''))
        and brands.deleted_at is null
    )
  );
