-- Outcome-review idempotency is enforced in the repository by a read-then-insert on
-- (task_id, task_version, cycle_key). Two concurrent reviews can both pass that check,
-- so the tuple needs a constraint behind it.
CREATE UNIQUE INDEX IF NOT EXISTS work_outcome_reviews_task_cycle_key
  ON public.work_outcome_reviews (task_id, task_version, cycle_key);
