-- Allow authenticated content requests to write owned distribution and keyword rows.

REVOKE INSERT, UPDATE, DELETE ON public.distributions FROM venturecite_content_request;
GRANT SELECT (id, article_id, platform, status, distributed_at, platform_post_id, platform_url, metadata, error, created_at)
  ON public.distributions TO venturecite_content_request;
GRANT INSERT (id, article_id, platform, status, metadata)
  ON public.distributions TO venturecite_content_request;
GRANT UPDATE (status, distributed_at, metadata, error)
  ON public.distributions TO venturecite_content_request;

REVOKE INSERT, UPDATE, DELETE ON public.keyword_research FROM venturecite_content_request;
GRANT UPDATE (
  keyword, search_volume, difficulty, opportunity_score, ai_citation_potential,
  intent, category, competitor_gap, suggested_content_type, related_keywords,
  status, content_generated, updated_at
) ON public.keyword_research TO venturecite_content_request;
GRANT DELETE ON public.keyword_research TO venturecite_content_request;

DROP POLICY IF EXISTS distributions_content_request_insert ON public.distributions;
CREATE POLICY distributions_content_request_insert
  ON public.distributions
  FOR INSERT
  TO venturecite_content_request
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = distributions.article_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS distributions_content_request_update ON public.distributions;
CREATE POLICY distributions_content_request_update
  ON public.distributions
  FOR UPDATE
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = distributions.article_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = distributions.article_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS keyword_research_content_request_update ON public.keyword_research;
CREATE POLICY keyword_research_content_request_update
  ON public.keyword_research
  FOR UPDATE
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = keyword_research.brand_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = keyword_research.brand_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS keyword_research_content_request_delete ON public.keyword_research;
CREATE POLICY keyword_research_content_request_delete
  ON public.keyword_research
  FOR DELETE
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = keyword_research.brand_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS distributions_content_request_select ON public.distributions;
CREATE POLICY distributions_content_request_select
  ON public.distributions
  FOR SELECT
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = distributions.article_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS keyword_research_content_request_select ON public.keyword_research;
CREATE POLICY keyword_research_content_request_select
  ON public.keyword_research
  FOR SELECT
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = keyword_research.brand_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );
