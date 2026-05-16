-- Drop tables with zero remaining code paths after the orphan-page cleanup.
--
-- These tables were exclusively read/written by:
--   - server/routes/agent.ts          (deleted)
--   - server/routes/revenue.ts        (deleted)
--   - server/lib/agentTaskExecutor.ts (handlers stripped, only prompt_test remains)
--   - 8 orphan client pages           (deleted)
--
-- After those deletions, no code path reads or writes any of these tables.
-- CASCADE handles FK constraints from agent_tasks (which references
-- automation_rules.id via automation_rule_id) and any other dependents.

DROP TABLE IF EXISTS automation_executions CASCADE;
DROP TABLE IF EXISTS automation_rules CASCADE;
DROP TABLE IF EXISTS outreach_emails CASCADE;
DROP TABLE IF EXISTS outreach_campaigns CASCADE;
DROP TABLE IF EXISTS publication_targets CASCADE;
