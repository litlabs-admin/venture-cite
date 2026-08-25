-- Cache request context once per statement in the active RLS policies.
-- Keep policy roles, commands, and access predicates unchanged.

ALTER POLICY users_request_select ON public.users
  TO venturecite_request
  USING (id = nullif((select current_setting('venturecite.user_id', true)), ''));

ALTER POLICY users_request_update ON public.users
  TO venturecite_request
  USING (id = nullif((select current_setting('venturecite.user_id', true)), ''))
  WITH CHECK (id = nullif((select current_setting('venturecite.user_id', true)), ''));

ALTER POLICY brands_request_select ON public.brands
  TO venturecite_request
  USING (user_id = nullif((select current_setting('venturecite.user_id', true)), ''));

ALTER POLICY brands_request_insert ON public.brands
  TO venturecite_request
  WITH CHECK (user_id = nullif((select current_setting('venturecite.user_id', true)), ''));

ALTER POLICY brands_request_update ON public.brands
  TO venturecite_request
  USING (user_id = nullif((select current_setting('venturecite.user_id', true)), ''))
  WITH CHECK (user_id = nullif((select current_setting('venturecite.user_id', true)), ''));

ALTER POLICY brands_content_select ON public.brands
  TO venturecite_content_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND deleted_at IS NULL
  );

ALTER POLICY distributions_content_request_select ON public.distributions
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = distributions.article_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY keyword_research_content_request_select ON public.keyword_research
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = keyword_research.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY content_generation_jobs_content_request_select ON public.content_generation_jobs
  TO venturecite_content_request
  USING (
    user_id = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = content_generation_jobs.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = content_generation_jobs.article_id
        AND articles.brand_id = content_generation_jobs.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY articles_content_request_insert ON public.articles
  TO venturecite_content_request
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY articles_content_request_update ON public.articles
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY articles_content_request_delete ON public.articles
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY article_revisions_content_request_insert ON public.article_revisions
  TO venturecite_content_request
  WITH CHECK (
    created_by = nullif((select current_setting('venturecite.user_id', true)), '')
    AND EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = article_revisions.article_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY articles_content_request_select ON public.articles
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = articles.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY article_revisions_content_request_select ON public.article_revisions
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = article_revisions.article_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY distributions_content_request_insert ON public.distributions
  TO venturecite_content_request
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = distributions.article_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY distributions_content_request_update ON public.distributions
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = distributions.article_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.articles
      JOIN public.brands ON brands.id = articles.brand_id
      WHERE articles.id = distributions.article_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY keyword_research_content_request_update ON public.keyword_research
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = keyword_research.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = keyword_research.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY keyword_research_content_request_delete ON public.keyword_research
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = keyword_research.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY api_costs_outbox_worker_insert ON public.api_costs
  TO venturecite_outbox_worker
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.outbox_user_id', true)), '')
    AND service <> ''
    AND tokens_in >= 0
    AND tokens_out >= 0
    AND est_cost_cents >= 0
    AND idempotency_key IS NOT NULL
  );

ALTER POLICY api_costs_outbox_worker_select_key ON public.api_costs
  TO venturecite_outbox_worker
  USING (user_id = nullif((select current_setting('venturecite.outbox_user_id', true)), ''));
