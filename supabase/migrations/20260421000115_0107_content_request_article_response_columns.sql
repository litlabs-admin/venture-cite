-- Source: migrations/0107_content_request_article_response_columns.sql
-- SHA256: a834507ad02f9e92a6ffce6a5052024a1acf7c4e0b5f1e0bd98743f937ce1099

-- Add request-safe article response columns without changing migration 0104.

GRANT SELECT (
  id, brand_id, title, content, excerpt, meta_description, keywords, industry,
  content_type, featured_image, author, view_count, citation_count, version,
  status, job_id, target_customers, geography, content_style, external_url,
  human_score, passes_ai_detection, ai_generated, created_at, updated_at, seo_data
) ON public.articles TO venturecite_content_request;
