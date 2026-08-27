-- Source: migrations/0118_retention_indexes_and_rls_initplan.sql
-- SHA256: 4ba49fb58d36fa82fa720bbd29441043f0bd4e4ca9b86f71900bc1b49dec2105

create index if not exists brand_fact_sheet_run_id_idx
  on brand_fact_sheet (run_id);

create index if not exists brand_perception_probes_brand_id_idx
  on brand_perception_probes (brand_id);

create index if not exists faq_items_article_id_idx
  on faq_items (article_id);

ALTER POLICY brand_prompts_content_request_select ON public.brand_prompts
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = brand_prompts.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );

ALTER POLICY citation_runs_content_request_select ON public.citation_runs
  TO venturecite_content_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands
      WHERE brands.id = citation_runs.brand_id
        AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
        AND brands.deleted_at IS NULL
    )
  );
