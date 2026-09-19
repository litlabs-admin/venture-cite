-- Source: migrations/0127_ask_actions.sql
-- SHA256: 7d786cb55b51943248f6b068103502df90cc19c810eb8d51f61b429e20ed1a90

-- Ask feature: action-card columns on the shared agent_tasks table.
--
-- agent_tasks is a shared platform table (belongs to neither Ask nor the AI
-- Tutor - docs/ask-feature/07 §0), so extending it (rather than forking a
-- parallel table) is consistent with the independence decision. The new FKs
-- point at ask_threads/ask_messages (migration 0126), never chatbot_*.
--
-- Two widenings are required by columns this migration does NOT add, found
-- by reading the existing constraints rather than assuming:
--   - agent_tasks_status_check (migration 0026) currently allows
--     ('queued','scheduled','in_progress','completed','failed','cancelled').
--     Ask's action lifecycle needs 'proposed' (a card awaiting Approve/
--     Dismiss) and 'reversed' (undo executed). Both added below.
--   - agent_tasks_artifact_type_check (migration 0071) currently allows only
--     ('citation_run'). track_prompt's artifact is the tracked brand_prompt
--     row it created; 'brand_prompt' is added so that link can be recorded
--     the same way citation_run already is.

ALTER TABLE public.agent_tasks
  ADD COLUMN IF NOT EXISTS ask_thread_id uuid
    REFERENCES public.ask_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ask_message_id uuid
    REFERENCES public.ask_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_kind text,
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by varchar REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

CREATE INDEX IF NOT EXISTS agent_tasks_ask_thread_idx
  ON public.agent_tasks (ask_thread_id, created_at)
  WHERE ask_thread_id IS NOT NULL;

-- work_kind is deliberately left unconstrained (no CHECK, nullable, and every
-- Ask-created row leaves it NULL this release) - see shared/ask/constants.ts's
-- header comment. A constraint now would have to be dropped once the
-- automation taxonomy question is actually resolved.

ALTER TABLE public.agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_status_check;
ALTER TABLE public.agent_tasks
  ADD CONSTRAINT agent_tasks_status_check
  CHECK (status IN (
    'queued', 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled',
    'proposed', 'reversed'
  ));

ALTER TABLE public.agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_artifact_type_check;
ALTER TABLE public.agent_tasks
  ADD CONSTRAINT agent_tasks_artifact_type_check
  CHECK (artifact_type IS NULL OR artifact_type IN ('citation_run', 'brand_prompt'));
