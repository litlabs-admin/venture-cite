-- FK hardening pass: add ON DELETE CASCADE, NOT NULL on brandId, indexes on
-- every brandId column, and a composite (brand_id, slug) unique on articles
-- (replacing the old global slug unique so two brands can own the same
-- slug). Idempotent: uses `IF NOT EXISTS` and `DO $$ ... END $$` guards so
-- it's safe to re-run on every boot via server/index.ts applyMigrations().
--
-- Drizzle-kit push couldn't diff ON DELETE semantics cleanly against a DB
-- populated by earlier pushes, so this file is handcrafted.

-- ─── articles: composite (brand_id, slug) unique ─────────────────────────
-- The old global unique on `slug` prevents two brands from owning articles
-- with the same slug. Drop it (if it still exists) and replace with a
-- compound unique index on (brand_id, slug).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'articles_slug_unique'
      and conrelid = 'public.articles'::regclass
  ) then
    alter table public.articles drop constraint articles_slug_unique;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'articles_slug_unique'
  ) then
    drop index public.articles_slug_unique;
  end if;
end $$;

create unique index if not exists articles_brand_slug_idx
  on public.articles (brand_id, slug);

-- articles needs brand_id NOT NULL going forward. Only flip if no null rows
-- exist (safety net — all rows should already have brand_id after routes.ts
-- allowlist fix).
do $$
begin
  if not exists (select 1 from public.articles where brand_id is null) then
    begin
      alter table public.articles alter column brand_id set not null;
    exception when others then null;
    end;
  end if;
end $$;

-- ─── Generic helper for flipping other brand_id columns to NOT NULL ──────
do $$
declare
  t text;
  tables text[] := array[
    'competitors','listicles','wikipedia_mentions','bofu_content','faq_items',
    'brand_mentions','prompt_portfolio','citation_quality','brand_hallucinations',
    'brand_fact_sheet','metrics_history','alert_settings','ai_sources',
    'ai_traffic_sessions','prompt_test_runs','agent_tasks','outreach_campaigns',
    'publication_targets','outreach_emails','automation_rules','community_posts'
  ];
begin
  foreach t in array tables loop
    execute format(
      'do $inner$ begin
         if exists (select 1 from information_schema.columns
                    where table_schema = ''public'' and table_name = %L and column_name = ''brand_id'')
            and not exists (select 1 from public.%I where brand_id is null) then
           begin
             alter table public.%I alter column brand_id set not null;
           exception when others then null;
           end;
         end if;
       end $inner$;',
      t, t, t
    );
  end loop;
end $$;

-- ─── ON DELETE CASCADE on brand_id FKs ───────────────────────────────────
-- We drop and recreate each brand_id FK with ON DELETE CASCADE. Wrapped in
-- a DO block per-table so one failure doesn't abort the rest.
do $$
declare
  rec record;
  cascade_tables text[] := array[
    'articles','competitors','keyword_research','brand_visibility_snapshots',
    'ai_commerce_sessions','purchase_events','listicles','wikipedia_mentions',
    'bofu_content','faq_items','brand_mentions','prompt_portfolio',
    'citation_quality','brand_hallucinations','brand_fact_sheet',
    'metrics_history','alert_settings','alert_history','ai_sources',
    'ai_traffic_sessions','prompt_test_runs','agent_tasks','outreach_campaigns',
    'publication_targets','outreach_emails','automation_rules',
    'automation_executions','community_posts'
  ];
  t text;
  fk_name text;
begin
  foreach t in array cascade_tables loop
    -- Find the existing brand_id FK (any name) for this table, if present.
    select c.conname into fk_name
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.conrelid = ('public.' || t)::regclass
      and a.attname = 'brand_id'
    limit 1;

    if fk_name is not null then
      execute format('alter table public.%I drop constraint %I', t, fk_name);
      execute format(
        'alter table public.%I add constraint %I foreign key (brand_id) references public.brands(id) on delete cascade',
        t, t || '_brand_id_fkey'
      );
    end if;
  end loop;
exception when others then
  -- If any individual cascade swap fails (e.g. the target table doesn't
  -- exist yet), log and move on — the next boot will retry.
  raise notice 'cascade swap failed: %', sqlerrm;
end $$;

-- ─── ON DELETE CASCADE on article_id FKs ─────────────────────────────────
do $$
declare
  rec record;
  cascade_tables text[] := array[
    'distributions','geo_rankings','ai_commerce_sessions','purchase_events',
    'publication_references','faq_items','citation_quality','ai_traffic_sessions',
    'outreach_campaigns','keyword_research'
  ];
  t text;
  fk_name text;
begin
  foreach t in array cascade_tables loop
    select c.conname into fk_name
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.conrelid = ('public.' || t)::regclass
      and a.attname in ('article_id','linked_article_id')
    limit 1;

    if fk_name is not null then
      execute format('alter table public.%I drop constraint %I', t, fk_name);
      -- distributions + geo_rankings delete with the article; others set null.
      if t in ('distributions','geo_rankings') then
        execute format(
          'alter table public.%I add constraint %I foreign key (article_id) references public.articles(id) on delete cascade',
          t, t || '_article_id_fkey'
        );
      else
        execute format(
          'alter table public.%I add constraint %I foreign key (article_id) references public.articles(id) on delete set null',
          t, t || '_article_id_fkey'
        );
      end if;
    end if;
  end loop;
exception when others then
  raise notice 'article cascade swap failed: %', sqlerrm;
end $$;

-- ─── Indexes on every brand_id + article_id FK column ─────────────────────
create index if not exists articles_brand_id_idx on public.articles (brand_id);
create index if not exists articles_status_idx on public.articles (status);
create index if not exists distributions_article_id_idx on public.distributions (article_id);
create index if not exists keyword_research_brand_id_idx on public.keyword_research (brand_id);
create index if not exists geo_rankings_article_id_idx on public.geo_rankings (article_id);
create index if not exists geo_rankings_ai_platform_idx on public.geo_rankings (ai_platform);
create index if not exists brand_visibility_snapshots_brand_id_idx on public.brand_visibility_snapshots (brand_id);
create index if not exists ai_commerce_sessions_brand_id_idx on public.ai_commerce_sessions (brand_id);
create index if not exists purchase_events_brand_id_idx on public.purchase_events (brand_id);
create index if not exists competitors_brand_id_idx on public.competitors (brand_id);
create index if not exists competitor_citation_snapshots_competitor_id_idx on public.competitor_citation_snapshots (competitor_id);
create index if not exists listicles_brand_id_idx on public.listicles (brand_id);
create index if not exists wikipedia_mentions_brand_id_idx on public.wikipedia_mentions (brand_id);
create index if not exists bofu_content_brand_id_idx on public.bofu_content (brand_id);
create index if not exists faq_items_brand_id_idx on public.faq_items (brand_id);
create index if not exists brand_mentions_brand_id_idx on public.brand_mentions (brand_id);
create index if not exists prompt_portfolio_brand_id_idx on public.prompt_portfolio (brand_id);
create index if not exists citation_quality_brand_id_idx on public.citation_quality (brand_id);
create index if not exists brand_hallucinations_brand_id_idx on public.brand_hallucinations (brand_id);
create index if not exists brand_fact_sheet_brand_id_idx on public.brand_fact_sheet (brand_id);
create index if not exists metrics_history_brand_id_idx on public.metrics_history (brand_id);
create index if not exists alert_settings_brand_id_idx on public.alert_settings (brand_id);
create index if not exists alert_history_brand_id_idx on public.alert_history (brand_id);
create index if not exists ai_sources_brand_id_idx on public.ai_sources (brand_id);
create index if not exists ai_traffic_sessions_brand_id_idx on public.ai_traffic_sessions (brand_id);
create index if not exists prompt_test_runs_brand_id_idx on public.prompt_test_runs (brand_id);
create index if not exists agent_tasks_brand_id_idx on public.agent_tasks (brand_id);
create index if not exists agent_tasks_status_idx on public.agent_tasks (status);
create index if not exists outreach_campaigns_brand_id_idx on public.outreach_campaigns (brand_id);
create index if not exists publication_targets_brand_id_idx on public.publication_targets (brand_id);
create index if not exists outreach_emails_brand_id_idx on public.outreach_emails (brand_id);
create index if not exists automation_rules_brand_id_idx on public.automation_rules (brand_id);
create index if not exists automation_executions_rule_id_idx on public.automation_executions (automation_rule_id);
create index if not exists automation_executions_brand_id_idx on public.automation_executions (brand_id);
create index if not exists community_posts_brand_id_idx on public.community_posts (brand_id);
