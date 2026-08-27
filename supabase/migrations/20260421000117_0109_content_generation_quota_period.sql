-- Source: migrations/0109_content_generation_quota_period.sql
-- SHA256: a1644d45da4c3c09a2ca46e0655fbf56c85b949eb3d6366a1096dd9d9ded3be3

-- Record the usage period that receives each content-generation reservation.
-- A later cancellation must not refund a different period.

ALTER TABLE public.content_generation_jobs
  ADD COLUMN IF NOT EXISTS quota_reservation_period timestamp;

CREATE OR REPLACE FUNCTION private.capture_content_generation_quota_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF NEW.quota_reservation_period IS NULL THEN
    SELECT users.usage_reset_date
      INTO NEW.quota_reservation_period
      FROM public.users AS users
     WHERE users.id = NEW.user_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS content_generation_job_quota_period ON public.content_generation_jobs;
CREATE TRIGGER content_generation_job_quota_period
  BEFORE INSERT ON public.content_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_content_generation_quota_period();

CREATE OR REPLACE FUNCTION private.request_cancel_content_generation(
  p_job_id TEXT
)
RETURNS TABLE (
  kind TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  actor_id TEXT := nullif(btrim(current_setting('venturecite.user_id', true)), '');
  active_role TEXT := nullif(current_setting('role', true), 'none');
  job_row RECORD;
  user_row RECORD;
  locked_job RECORD;
  refund_needed BOOLEAN;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'content request actor is required';
  END IF;
  IF active_role IS DISTINCT FROM 'venturecite_content_request'
     OR NOT pg_has_role(session_user, 'venturecite_content_request', 'member') THEN
    RAISE EXCEPTION 'content request caller is not authorized';
  END IF;
  IF p_job_id IS NULL OR btrim(p_job_id) = '' THEN
    RAISE EXCEPTION 'invalid content generation job';
  END IF;

  -- Read first, then lock in user -> job order. Worker terminal writes lock
  -- the job before the article, so cancellation either wins or observes them.
  SELECT jobs.user_id, jobs.brand_id
    INTO job_row
    FROM public.content_generation_jobs AS jobs
   WHERE jobs.id = p_job_id;
  IF NOT FOUND OR job_row.user_id IS DISTINCT FROM actor_id
     OR NOT EXISTS (
       SELECT 1
         FROM public.brands AS brands
        WHERE brands.id = job_row.brand_id
          AND brands.user_id = actor_id
          AND brands.deleted_at IS NULL
     ) THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT users.usage_reset_date
    INTO user_row
    FROM public.users AS users
   WHERE users.id = actor_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT jobs.*
    INTO locked_job
    FROM public.content_generation_jobs AS jobs
   WHERE jobs.id = p_job_id
   FOR UPDATE;
  IF NOT FOUND OR locked_job.user_id IS DISTINCT FROM actor_id THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  IF locked_job.brand_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.brands AS brands
        WHERE brands.id = locked_job.brand_id
          AND brands.user_id = actor_id
          AND brands.deleted_at IS NULL
     )
     OR (locked_job.article_id IS NOT NULL AND NOT EXISTS (
       SELECT 1
         FROM public.articles AS articles
        WHERE articles.id = locked_job.article_id
          AND articles.brand_id = locked_job.brand_id
     )) THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF locked_job.status NOT IN ('pending', 'running') THEN
    RETURN QUERY SELECT 'already_terminal'::TEXT, locked_job.status;
    RETURN;
  END IF;

  -- New jobs carry the exact reservation period. The created_at fallback
  -- keeps cancellation safe for jobs created before this migration.
  refund_needed := locked_job.refunded_at IS NULL
    AND (
      (locked_job.quota_reservation_period IS NOT NULL
       AND locked_job.quota_reservation_period IS NOT DISTINCT FROM user_row.usage_reset_date)
      OR (locked_job.quota_reservation_period IS NULL
          AND (user_row.usage_reset_date IS NULL
               OR locked_job.created_at >= user_row.usage_reset_date))
    );

  UPDATE public.content_generation_jobs
     SET status = 'cancelled',
         completed_at = now(),
         advance_token = NULL,
         advance_lease_expires_at = NULL,
         refunded_at = CASE WHEN refund_needed THEN now() ELSE refunded_at END
   WHERE id = p_job_id;

  IF refund_needed THEN
    UPDATE public.users
       SET articles_used_this_month = greatest(articles_used_this_month - 1, 0)
     WHERE id = actor_id;
  END IF;

  -- Only the article linked to this job can return to draft. A newer job
  -- keeps its generating state.
  IF locked_job.article_id IS NOT NULL THEN
    UPDATE public.articles
       SET status = 'draft',
           job_id = NULL,
           updated_at = now()
     WHERE id = locked_job.article_id
       AND job_id = p_job_id;
  END IF;

  RETURN QUERY SELECT 'cancelled'::TEXT, 'cancelled'::TEXT;
END
$$;

REVOKE ALL ON FUNCTION private.capture_content_generation_quota_period() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.request_cancel_content_generation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.request_cancel_content_generation(TEXT)
  TO venturecite_content_request;
