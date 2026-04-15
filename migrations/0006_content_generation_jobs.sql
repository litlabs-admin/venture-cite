-- Background job queue for content generation so long-running GPT calls
-- survive page navigation, logout, and browser refresh. Polled in-process
-- by server/contentGenerationWorker.ts.

create table if not exists public.content_generation_jobs (
  id varchar primary key default gen_random_uuid(),
  user_id varchar not null references public.users(id) on delete cascade,
  brand_id varchar references public.brands(id) on delete set null,
  status text not null default 'pending',
  request_payload jsonb not null,
  article_id varchar references public.articles(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists content_gen_jobs_user_status_idx
  on public.content_generation_jobs(user_id, status);

create index if not exists content_gen_jobs_status_idx
  on public.content_generation_jobs(status);
