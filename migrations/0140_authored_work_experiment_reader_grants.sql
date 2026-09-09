-- Read projections for the authored_work evidence reader. The experiment reader
-- already has the required bofu_content and citation_runs grants from migration 0132.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'venturecite_request'
  ) THEN
    RAISE EXCEPTION 'venturecite_request must be created by migration 0096 first';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  post_url,
  posted_at,
  status
) ON public.community_posts TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  url,
  outreach_status
) ON public.listicles TO venturecite_request;
