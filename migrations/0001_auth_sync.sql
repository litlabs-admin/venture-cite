-- Supabase Auth → public.users mirror + RLS defense-in-depth
-- Applied automatically by server/index.ts applyMigrations() on every boot.
-- Idempotent: safe to re-run.

-- ─── auth.users → public.users mirror trigger ────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id, email, first_name, last_name, email_verified, created_at, updated_at
  ) values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'firstName',
    new.raw_user_meta_data->>'lastName',
    case when new.email_confirmed_at is not null then 1 else 0 end,
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, public.users.first_name),
    last_name = coalesce(excluded.last_name, public.users.last_name),
    email_verified = excluded.email_verified,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

-- ─── RLS: deny-all defense-in-depth ───────────────────────────────────────
-- Our Express server connects to Postgres as the `postgres` superuser via
-- pg.Pool. Superuser bypasses RLS entirely, so none of the app's reads or
-- writes are affected by enabling it here.
--
-- The purpose is belt-and-suspenders: if anyone ever wires the anon or
-- authenticated key into the browser for direct table access, every query
-- will be blocked by "no policies = deny all" rather than silently leaking
-- data. Also silences Supabase Studio's "RLS disabled" warnings so real
-- issues aren't buried.
--
-- alter table ... enable row level security is idempotent (no-op if already
-- enabled), so this block re-runs safely on every boot.

alter table public.users enable row level security;
alter table public.beta_invite_codes enable row level security;
alter table public.waitlist enable row level security;
alter table public.citations enable row level security;
alter table public.analytics enable row level security;
alter table public.brands enable row level security;
alter table public.articles enable row level security;
alter table public.distributions enable row level security;
alter table public.keyword_research enable row level security;
alter table public.geo_rankings enable row level security;
alter table public.brand_visibility_snapshots enable row level security;
alter table public.ai_commerce_sessions enable row level security;
alter table public.purchase_events enable row level security;
alter table public.publication_references enable row level security;
alter table public.publication_metrics enable row level security;
alter table public.competitors enable row level security;
alter table public.competitor_citation_snapshots enable row level security;
alter table public.listicles enable row level security;
alter table public.wikipedia_mentions enable row level security;
alter table public.bofu_content enable row level security;
alter table public.faq_items enable row level security;
alter table public.brand_mentions enable row level security;
alter table public.prompt_portfolio enable row level security;
alter table public.citation_quality enable row level security;
alter table public.brand_hallucinations enable row level security;
alter table public.brand_fact_sheet enable row level security;
alter table public.metrics_history enable row level security;
alter table public.alert_settings enable row level security;
alter table public.alert_history enable row level security;
alter table public.ai_sources enable row level security;
alter table public.ai_traffic_sessions enable row level security;
alter table public.prompt_test_runs enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.outreach_campaigns enable row level security;
alter table public.publication_targets enable row level security;
alter table public.outreach_emails enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_executions enable row level security;
alter table public.community_posts enable row level security;
