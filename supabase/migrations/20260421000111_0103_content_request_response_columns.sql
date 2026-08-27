-- Source: migrations/0103_content_request_response_columns.sql
-- SHA256: 75da3ed6f719bdd7a7de6a40435fa3faff802caba0984109757f624890481ab8

-- Preserve existing article and distribution response fields through the
-- restricted content request role.

GRANT SELECT (citation_count, human_score, passes_ai_detection)
  ON public.articles TO venturecite_content_request;

GRANT SELECT (platform_post_id, platform_url, error)
  ON public.distributions TO venturecite_content_request;
