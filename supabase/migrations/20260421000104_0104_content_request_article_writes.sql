-- Source: migrations/0104_content_request_article_writes.sql
-- SHA256: 65ad049e357721c42b05e13ebec3b9280e683284a1dc84a9901ed832193bf228

-- Allow the restricted content request role to write owned article history.

REVOKE INSERT, UPDATE, DELETE ON public.articles FROM venturecite_content_request;
REVOKE INSERT ON public.article_revisions FROM venturecite_content_request;

GRANT INSERT (
  id, brand_id, title, content, excerpt, meta_description, keywords, industry,
  content_type, featured_image, author, status, target_customers, geography,
  content_style, external_url, seo_data
) ON public.articles TO venturecite_content_request;

GRANT UPDATE (
  brand_id, title, content, excerpt, meta_description, keywords, industry,
  content_type, featured_image, author, target_customers, geography,
  content_style, external_url, seo_data, updated_at, version
) ON public.articles TO venturecite_content_request;

GRANT DELETE ON public.articles TO venturecite_content_request;

GRANT INSERT (id, article_id, content, source, created_by)
  ON public.article_revisions TO venturecite_content_request;

DROP POLICY IF EXISTS articles_content_request_insert ON public.articles;
CREATE POLICY articles_content_request_insert
  ON public.articles
  FOR INSERT
  TO venturecite_content_request
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS articles_content_request_update ON public.articles;
CREATE POLICY articles_content_request_update
  ON public.articles
  FOR UPDATE
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS articles_content_request_delete ON public.articles;
CREATE POLICY articles_content_request_delete
  ON public.articles
  FOR DELETE
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS article_revisions_content_request_insert ON public.article_revisions;
CREATE POLICY article_revisions_content_request_insert
  ON public.article_revisions
  FOR INSERT
  TO venturecite_content_request
  WITH CHECK (
    created_by = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
    AND EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = article_revisions.article_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS articles_content_request_select ON public.articles;
CREATE POLICY articles_content_request_select
  ON public.articles
  FOR SELECT
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS article_revisions_content_request_select ON public.article_revisions;
CREATE POLICY article_revisions_content_request_select
  ON public.article_revisions
  FOR SELECT
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = article_revisions.article_id
        AND brands.user_id = (SELECT nullif(current_setting('venturecite.user_id', true), ''))
        AND brands.deleted_at IS NULL
    )
  );
