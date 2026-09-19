-- Source: migrations/0126_ask_core.sql
-- SHA256: a5f2c81070f8dde96c96e2d454c0354560f2140ef8838f42d8b743f0cac374d5

-- Ask feature: core tables.
--
-- Independence decision (docs/ask-feature/07-integration-and-hardening.md §0):
-- Ask and the AI Tutor share no tables. Every table below is new and
-- additive - nothing here touches chatbot_threads, chatbot_messages or
-- chatbot_token_usage, and no existing query reads these tables, so this
-- migration cannot break the shipped AI Tutor at any point during deploy.
--
-- Shape mirrors chatbot_threads/chatbot_messages/chatbot_token_usage
-- (migration that created shared/schema/chatbot.ts) because the problem is
-- the same shape - threaded, streamed, budget-capped chat - but the tables
-- are NOT shared: ask_usage counts RUNS per hour, not messages, because one
-- Ask run costs several model calls and a message-count cap is the wrong
-- instrument for it (03-gap-analysis.md B10).

CREATE TABLE IF NOT EXISTS public.ask_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_id varchar REFERENCES public.brands(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'New thread',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS ask_threads_user_updated_idx
  ON public.ask_threads (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ask_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.ask_threads(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_id varchar REFERENCES public.brands(id) ON DELETE SET NULL,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  blocks jsonb,
  evidence jsonb,
  suggestions jsonb,
  duration_ms integer,
  pages_read integer NOT NULL DEFAULT 0,
  run_status text,
  degraded_reasons jsonb,
  input_tokens integer,
  output_tokens integer,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ask_messages_role_check CHECK (role IN ('user', 'assistant')),
  CONSTRAINT ask_messages_run_status_check
    CHECK (run_status IS NULL OR run_status IN ('ok', 'degraded', 'stopped', 'error'))
);

CREATE INDEX IF NOT EXISTS ask_messages_thread_created_idx
  ON public.ask_messages (thread_id, created_at);

CREATE TABLE IF NOT EXISTS public.ask_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.ask_messages(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  tool_name text NOT NULL,
  label text NOT NULL,
  category text,
  summary text,
  duration_ms integer,
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ask_steps_status_check CHECK (status IN ('ok', 'failed'))
);

CREATE INDEX IF NOT EXISTS ask_steps_message_ordinal_idx
  ON public.ask_steps (message_id, ordinal);

CREATE TABLE IF NOT EXISTS public.ask_usage (
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  run_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

-- RLS: enabled with zero policies, matching the pattern every tenant table
-- in this schema uses (0081 and onward) apart from the nine tables 0124
-- gave a dedicated second-layer role. The application connection
-- (DATABASE_URL) is an owner-equivalent role with rolbypassrls = true, so
-- these statements are the same default-deny shape as the rest of the
-- schema, not a functional access-control layer on their own - ownership is
-- enforced in server/ask/ownership.ts (requireAskThread), exactly like every
-- other domain in this application.
ALTER TABLE public.ask_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_usage ENABLE ROW LEVEL SECURITY;
