-- Source: migrations/0106_content_request_generation_commands.sql
-- SHA256: 619d245484c2a9d82addd825be69a703ccc14ebffe6c7395074b8671e6a7817a

-- Keep content-generation request writes behind actor-bound commands.
-- Worker-owned fields stay outside this boundary.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.request_enqueue_content_generation(
  p_article_id TEXT,
  p_brand_id TEXT,
  p_request_payload JSONB,
  p_keywords TEXT[],
  p_industry TEXT,
  p_content_type TEXT,
  p_target_customers TEXT,
  p_geography TEXT,
  p_content_style TEXT
)
RETURNS TABLE (
  kind TEXT,
  job_id TEXT,
  article_status TEXT,
  quota_cap INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  actor_id TEXT := nullif(btrim(current_setting('venturecite.user_id', true)), '');
  active_role TEXT := nullif(current_setting('role', true), 'none');
  user_row RECORD;
  brand_row RECORD;
  article_row RECORD;
  new_job_id TEXT;
  article_cap INTEGER;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'content request actor is required';
  END IF;
  IF active_role IS DISTINCT FROM 'venturecite_content_request'
     OR NOT pg_has_role(session_user, 'venturecite_content_request', 'member') THEN
    RAISE EXCEPTION 'content request caller is not authorized';
  END IF;
  IF p_article_id IS NULL OR btrim(p_article_id) = ''
     OR p_brand_id IS NULL OR btrim(p_brand_id) = ''
     OR p_request_payload IS NULL
     OR jsonb_typeof(p_request_payload) <> 'object'
     OR p_keywords IS NULL
     OR p_industry IS NULL OR btrim(p_industry) = ''
     OR p_content_type IS NULL OR btrim(p_content_type) = ''
     OR p_content_style IS NULL OR p_content_style NOT IN ('b2b', 'b2c') THEN
    RAISE EXCEPTION 'invalid content generation request';
  END IF;

  -- Check ownership and status before quota work. This preserves 404 and 409
  -- results without revealing quota state for another user's article.
  SELECT articles.brand_id, articles.status
    INTO article_row
    FROM public.articles AS articles
   WHERE articles.id = p_article_id;
  IF NOT FOUND OR article_row.brand_id IS DISTINCT FROM p_brand_id
     OR NOT EXISTS (
       SELECT 1
         FROM public.brands AS brands
        WHERE brands.id = article_row.brand_id
          AND brands.user_id = actor_id
          AND brands.deleted_at IS NULL
     ) THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;
  IF article_row.status NOT IN ('draft', 'failed') THEN
    RETURN QUERY SELECT 'conflict'::TEXT, NULL::TEXT, article_row.status, NULL::INTEGER;
    RETURN;
  END IF;

  -- Lock the account before checking and reserving the monthly quota.
  SELECT users.access_tier, users.articles_used_this_month
    INTO user_row
    FROM public.users AS users
   WHERE users.id = actor_id
     AND users.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'content request actor is not active';
  END IF;

  article_cap := CASE user_row.access_tier
    WHEN 'pending' THEN 0
    WHEN 'readonly' THEN 0
    WHEN 'free' THEN 5
    WHEN 'beta' THEN 20
    WHEN 'pro' THEN 0
    WHEN 'agency' THEN 40
    WHEN 'enterprise' THEN 200
    WHEN 'admin' THEN -1
    ELSE 0
  END;

  -- Lock and revalidate the brand after the user. A concurrent soft-delete
  -- then either waits for this command or makes the request return not_found.
  SELECT brands.id, brands.user_id, brands.deleted_at
    INTO brand_row
    FROM public.brands AS brands
   WHERE brands.id = p_brand_id
   FOR UPDATE;
  IF NOT FOUND
     OR brand_row.user_id IS DISTINCT FROM actor_id
     OR brand_row.deleted_at IS NOT NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  -- Lock the article after the brand. A second request for the same draft
  -- then sees the first request's generating state and does not consume quota.
  SELECT articles.brand_id, articles.status
    INTO article_row
    FROM public.articles AS articles
   WHERE articles.id = p_article_id
   FOR UPDATE;
  IF NOT FOUND OR article_row.brand_id IS DISTINCT FROM brand_row.id THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  IF article_row.status NOT IN ('draft', 'failed') THEN
    RETURN QUERY SELECT 'conflict'::TEXT, NULL::TEXT, article_row.status, NULL::INTEGER;
    RETURN;
  END IF;

  IF article_cap <> -1 AND user_row.articles_used_this_month >= article_cap THEN
    RETURN QUERY SELECT 'quota'::TEXT, NULL::TEXT, NULL::TEXT, article_cap;
    RETURN;
  END IF;

  INSERT INTO public.content_generation_jobs (
    user_id,
    brand_id,
    status,
    request_payload,
    article_id
  )
  VALUES (
    actor_id,
    p_brand_id,
    'pending',
    p_request_payload,
    p_article_id
  )
  RETURNING id INTO new_job_id;

  UPDATE public.articles
     SET keywords = p_keywords,
         industry = p_industry,
         content_type = p_content_type,
         target_customers = p_target_customers,
         geography = p_geography,
         content_style = p_content_style,
         status = 'generating',
         job_id = new_job_id,
         updated_at = now()
   WHERE id = p_article_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'content generation article update failed';
  END IF;

  UPDATE public.users
     SET articles_used_this_month = articles_used_this_month + 1
   WHERE id = actor_id;

  RETURN QUERY SELECT 'created'::TEXT, new_job_id, 'pending'::TEXT, article_cap;
END
$$;

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

  refund_needed := locked_job.refunded_at IS NULL
    AND (
      user_row.usage_reset_date IS NULL
      OR locked_job.created_at >= user_row.usage_reset_date
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

CREATE OR REPLACE FUNCTION private.request_cancel_content_generation_for_article(
  p_article_id TEXT
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
  article_row RECORD;
  cancel_result RECORD;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'content request actor is required';
  END IF;
  IF active_role IS DISTINCT FROM 'venturecite_content_request'
     OR NOT pg_has_role(session_user, 'venturecite_content_request', 'member') THEN
    RAISE EXCEPTION 'content request caller is not authorized';
  END IF;
  IF p_article_id IS NULL OR btrim(p_article_id) = '' THEN
    RAISE EXCEPTION 'invalid content generation article';
  END IF;

  SELECT articles.status, articles.job_id
    INTO article_row
    FROM public.articles AS articles
    JOIN public.brands AS brands ON brands.id = articles.brand_id
   WHERE articles.id = p_article_id
     AND brands.user_id = actor_id
     AND brands.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  IF article_row.job_id IS NULL THEN
    RETURN QUERY SELECT 'no_active_job'::TEXT, article_row.status;
    RETURN;
  END IF;

  SELECT result.kind, result.status
    INTO cancel_result
    FROM private.request_cancel_content_generation(article_row.job_id) AS result;
  IF cancel_result.kind = 'not_found' THEN
    RETURN QUERY SELECT 'no_active_job'::TEXT, article_row.status;
  ELSE
    RETURN QUERY SELECT cancel_result.kind, cancel_result.status;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION private.request_enqueue_content_generation(TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.request_cancel_content_generation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.request_cancel_content_generation_for_article(TEXT) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO venturecite_content_request;
GRANT EXECUTE ON FUNCTION private.request_enqueue_content_generation(TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT)
  TO venturecite_content_request;
GRANT EXECUTE ON FUNCTION private.request_cancel_content_generation(TEXT)
  TO venturecite_content_request;
GRANT EXECUTE ON FUNCTION private.request_cancel_content_generation_for_article(TEXT)
  TO venturecite_content_request;
