-- agent_tasks cleanup follow-up to the orphan-page deletion pass.
--
-- (1) Null out stale artifact links. The legacy artifact_type values
--     ('content_job', 'outreach_email', 'hallucination', 'source_analysis')
--     came from agent_task executors that no longer exist. Some of the
--     referenced artifact tables were dropped in 0068/0069, so those
--     artifact_id pointers are dangling anyway. We keep the agent_task row
--     itself (audit/history) but clear the link.
--
-- (2) Drop `automation_rule_id` — referenced the now-dropped automation_rules
--     table. Already nullable, unused after the automation subsystem removal.
--
-- (3) Replace the legacy `artifact_type` CHECK constraint (from 0026) with a
--     tightened one. Only 'citation_run' is written today (by the prompt_test
--     handler in server/lib/agentTaskExecutor.ts).

UPDATE public.agent_tasks
SET artifact_type = NULL, artifact_id = NULL
WHERE artifact_type IS NOT NULL AND artifact_type <> 'citation_run';

ALTER TABLE public.agent_tasks DROP COLUMN IF EXISTS automation_rule_id;

ALTER TABLE public.agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_artifact_type_check;
ALTER TABLE public.agent_tasks
  ADD CONSTRAINT agent_tasks_artifact_type_check
  CHECK (artifact_type IS NULL OR artifact_type IN ('citation_run'));
