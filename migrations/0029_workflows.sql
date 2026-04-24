BEGIN;

CREATE TABLE IF NOT EXISTS workflow_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  workflow_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  current_step_index integer NOT NULL DEFAULT 0,
  step_states jsonb NOT NULL DEFAULT '[]'::jsonb,
  input jsonb,
  last_error text,
  triggered_by text NOT NULL DEFAULT 'manual',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS workflow_runs_brand_status_idx ON workflow_runs(brand_id, status);
CREATE INDEX IF NOT EXISTS workflow_runs_user_idx ON workflow_runs(user_id);

CREATE TABLE IF NOT EXISTS workflow_approvals (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id varchar NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  summary jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  responded_at timestamp,
  decision text
);

CREATE INDEX IF NOT EXISTS workflow_approvals_run_responded_idx ON workflow_approvals(run_id, responded_at);

ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS workflow_run_id varchar REFERENCES workflow_runs(id) ON DELETE SET NULL;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS workflow_step_key text;

CREATE INDEX IF NOT EXISTS agent_tasks_workflow_run_idx ON agent_tasks(workflow_run_id);

COMMIT;
