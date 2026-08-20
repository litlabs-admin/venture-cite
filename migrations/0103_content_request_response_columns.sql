-- Preserve existing article and distribution response fields through the
-- restricted content request role.

GRANT SELECT (citation_count, human_score, passes_ai_detection)
  ON public.articles TO venturecite_content_request;

GRANT SELECT (platform_post_id, platform_url, error)
  ON public.distributions TO venturecite_content_request;
