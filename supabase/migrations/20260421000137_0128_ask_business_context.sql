-- Source: migrations/0128_ask_business_context.sql
-- SHA256: 87b67080fe93e4bead9ce9e3af44af09d4fe2447c65d7aae2fef911fb05309b5

-- Ask business context: the Business brief, Memory and Your preferences
-- surfaces (business-context.md). Three new tables plus one column on the
-- existing ask_threads table.
--
-- Same independence posture as 0126/0127 (docs/ask-feature/07 §0): every
-- table here belongs to Ask alone. RLS is enabled with no policies, mirroring
-- 0126_ask_core.sql's own ask_threads/ask_messages/ask_steps/ask_usage -
-- the application pool is the only role that reads these tables today; RLS
-- is a defence-in-depth backstop against a future restricted role, not an
-- access-control mechanism in active use yet.

ALTER TABLE public.ask_threads
  ADD COLUMN IF NOT EXISTS temporary_instructions text;

CREATE TABLE IF NOT EXISTS public.ask_business_briefs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                 varchar NOT NULL UNIQUE
                             REFERENCES public.brands(id) ON DELETE CASCADE,
  status                   text NOT NULL DEFAULT 'draft',
  draft_products_services  text,
  draft_markets_audiences text,
  goals                    text,
  current_priorities       text,
  people_capacity          text,
  constraints              text,
  sources                  jsonb,
  scrape_status            text NOT NULL DEFAULT 'none',
  accepted_by              varchar REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at              timestamptz,
  dismissed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ask_business_briefs_status_check
    CHECK (status IN ('draft', 'accepted', 'dismissed')),
  CONSTRAINT ask_business_briefs_scrape_status_check
    CHECK (scrape_status IN ('none', 'running', 'ready', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.ask_memories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          varchar NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  type              text NOT NULL,
  content           text NOT NULL,
  origin            text NOT NULL DEFAULT 'manual',
  source_thread_id  uuid REFERENCES public.ask_threads(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.ask_messages(id) ON DELETE SET NULL,
  created_by        varchar REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  forgotten_at      timestamptz,
  CONSTRAINT ask_memories_type_check
    CHECK (type IN ('business_context', 'constraint', 'audience', 'point_of_difference', 'brand_fact', 'topic')),
  CONSTRAINT ask_memories_origin_check
    CHECK (origin IN ('manual', 'learned'))
);

CREATE INDEX IF NOT EXISTS ask_memories_brand_active_idx
  ON public.ask_memories (brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ask_user_preferences (
  user_id       varchar PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  tone          text,
  language      text,
  answer_length text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ask_user_preferences_tone_check
    CHECK (tone IS NULL OR tone IN ('direct', 'friendly', 'formal')),
  CONSTRAINT ask_user_preferences_answer_length_check
    CHECK (answer_length IS NULL OR answer_length IN ('short', 'balanced', 'detailed'))
);

ALTER TABLE public.ask_business_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_user_preferences ENABLE ROW LEVEL SECURITY;

-- The remember_fact action kind (server/ask/actions/kinds.ts) completes by
-- linking its agent_tasks row to the ask_memories row it created, the same
-- way track_prompt links to brand_prompt (migration 0127). Widen the same
-- constraint 0127 widened.
ALTER TABLE public.agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_artifact_type_check;
ALTER TABLE public.agent_tasks
  ADD CONSTRAINT agent_tasks_artifact_type_check
  CHECK (artifact_type IS NULL OR artifact_type IN ('citation_run', 'brand_prompt', 'ask_memory'));
