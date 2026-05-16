-- Drop the Shopify webhook idempotency-dedupe table. The Shopify orders
-- webhook handler was removed in migrations 0069 / commit-equivalent: no
-- code path reads or writes this table anymore.
--
-- Also drops `ai_commerce_sessions` (was used by the deleted ai-traffic page's
-- click-through tracker — orphaned alongside ai_traffic_sessions in 0069) and
-- the now-unused `get_agent_tasks` / `get_agent_task_stats` / `get_next_queued_task`
-- methods' tables (none — these were storage-method-only, no schema change).
--
-- Also drops `workflow_approvals`. The workflow approval subsystem was wired
-- but never executed — the only live workflow (weekly_catchup) has no steps
-- that require approval. All approval code paths in workflowEngine and
-- workflowStorage have been removed alongside this migration.

DROP TABLE IF EXISTS public.shopify_webhook_events CASCADE;
DROP TABLE IF EXISTS public.ai_commerce_sessions CASCADE;
DROP TABLE IF EXISTS public.workflow_approvals CASCADE;
