-- Source: migrations/0005_brand_prompts.sql
-- SHA256: eca943f4f051b06a614b5cde48a1dc748373b4ed35721a43abe6535ab8bc7db0

-- Brand-level citation prompt portfolio + rewire geo_rankings
create table if not exists public.brand_prompts (
  id varchar primary key default gen_random_uuid(),
  brand_id varchar not null references public.brands(id) on delete cascade,
  prompt text not null,
  rationale text,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists brand_prompts_brand_id_idx on public.brand_prompts(brand_id);

-- Allow geo_rankings rows to belong to a brand-level prompt run (no article)
alter table public.geo_rankings alter column article_id drop not null;
alter table public.geo_rankings add column if not exists brand_prompt_id varchar
  references public.brand_prompts(id) on delete set null;

create index if not exists geo_rankings_brand_prompt_id_idx on public.geo_rankings(brand_prompt_id);
