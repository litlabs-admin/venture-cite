-- Add the read projections required by the content and earned-media opportunity readers.
-- This migration grants read access only. Row-level policies keep the brand scope.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'venturecite_request'
  ) THEN
    RAISE EXCEPTION 'venturecite_request must be created by migration 0096 first';
  END IF;
END
$$;

GRANT SELECT (
  id,
  brand_id,
  content_type,
  title,
  primary_keyword,
  target_intent,
  status,
  published_url,
  published_at,
  updated_at
)
  ON public.bofu_content TO venturecite_request;

GRANT SELECT (brand_id, source_type, source_id, url, normalized_url)
  ON public.tracked_content_urls TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  platform,
  group_name,
  group_url,
  title,
  content,
  status,
  post_url,
  posted_at
)
  ON public.community_posts TO venturecite_request;

GRANT SELECT (
  id,
  brand_id,
  title,
  url,
  source_publication,
  is_included,
  outreach_status
)
  ON public.listicles TO venturecite_request;
