-- Source: migrations/0132_work_evidence_readers_rls.sql
-- SHA256: 606fa29e191a9f388fa851876cec11c20d589303eb05d2b1dc83e8b497ce194f

-- Restrict production evidence verification to independent, tenant-owned data.
-- This migration adds read access only. It does not grant write access.

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

-- These tables are read-only inputs for the work evidence authorizer.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.brand_fact_sheet,
  public.brand_fact_scrape_runs,
  public.brand_fact_scrape_pages,
  public.citation_runs,
  public.geo_rankings,
  public.brand_prompts,
  public.prompt_generations,
  public.bofu_content,
  public.tracked_content_urls
FROM venturecite_request;

GRANT SELECT (id, user_id, deleted_at) ON public.brands TO venturecite_request;
GRANT SELECT (
  id, brand_id, run_id, source_url, accepted_at, dismissed_at, is_active
) ON public.brand_fact_sheet TO venturecite_request;
GRANT SELECT (id, brand_id, status, completed_at) ON public.brand_fact_scrape_runs TO venturecite_request;
GRANT SELECT (id, run_id, status, fetched_at, status_code, canonical_url) ON public.brand_fact_scrape_pages TO venturecite_request;
GRANT SELECT (id, brand_id, status, completed_at) ON public.citation_runs TO venturecite_request;
GRANT SELECT (id, brand_id, run_id, brand_prompt_id, checked_at, ai_platform) ON public.geo_rankings TO venturecite_request;
GRANT SELECT (id, brand_id, generation_id) ON public.brand_prompts TO venturecite_request;
GRANT SELECT (id, brand_id) ON public.prompt_generations TO venturecite_request;
GRANT SELECT (id, brand_id, status, published_url, published_at) ON public.bofu_content TO venturecite_request;
GRANT SELECT (brand_id, source_type, source_id, normalized_url) ON public.tracked_content_urls TO venturecite_request;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_fact_sheet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_fact_scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_fact_scrape_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bofu_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_content_urls ENABLE ROW LEVEL SECURITY;

-- The application currently sets venturecite.user_id. app.user_id is also
-- accepted for direct role tests and future request context migration.
DROP POLICY IF EXISTS work_evidence_brands_select ON public.brands;
CREATE POLICY work_evidence_brands_select
  ON public.brands
  FOR SELECT
  TO venturecite_request
  USING (
    user_id = nullif(
      coalesce(
        nullif((select current_setting('app.user_id', true)), ''),
        nullif((select current_setting('venturecite.user_id', true)), '')
      ),
      ''
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS work_evidence_brand_fact_sheet_select ON public.brand_fact_sheet;
CREATE POLICY work_evidence_brand_fact_sheet_select
  ON public.brand_fact_sheet
  FOR SELECT
  TO venturecite_request
  USING (
    EXISTS (
      SELECT 1 FROM public.brands brand
      WHERE brand.id = brand_fact_sheet.brand_id
        AND brand.deleted_at IS NULL
        AND brand.user_id = nullif(coalesce(nullif((select current_setting('app.user_id', true)), ''), nullif((select current_setting('venturecite.user_id', true)), '')), '')
    )
  );

DROP POLICY IF EXISTS work_evidence_brand_fact_scrape_runs_select ON public.brand_fact_scrape_runs;
CREATE POLICY work_evidence_brand_fact_scrape_runs_select
  ON public.brand_fact_scrape_runs
  FOR SELECT
  TO venturecite_request
  USING (
    EXISTS (
      SELECT 1 FROM public.brands brand
      WHERE brand.id = brand_fact_scrape_runs.brand_id
        AND brand.deleted_at IS NULL
        AND brand.user_id = nullif(coalesce(nullif((select current_setting('app.user_id', true)), ''), nullif((select current_setting('venturecite.user_id', true)), '')), '')
    )
  );

DROP POLICY IF EXISTS work_evidence_brand_fact_scrape_pages_select ON public.brand_fact_scrape_pages;
CREATE POLICY work_evidence_brand_fact_scrape_pages_select
  ON public.brand_fact_scrape_pages
  FOR SELECT
  TO venturecite_request
  USING (
    EXISTS (
      SELECT 1
      FROM public.brand_fact_scrape_runs run
      JOIN public.brands brand ON brand.id = run.brand_id
      WHERE run.id = brand_fact_scrape_pages.run_id
        AND brand.deleted_at IS NULL
        AND brand.user_id = nullif(coalesce(nullif((select current_setting('app.user_id', true)), ''), nullif((select current_setting('venturecite.user_id', true)), '')), '')
    )
  );

DROP POLICY IF EXISTS work_evidence_citation_runs_select ON public.citation_runs;
CREATE POLICY work_evidence_citation_runs_select
  ON public.citation_runs
  FOR SELECT
  TO venturecite_request
  USING (
    EXISTS (
      SELECT 1 FROM public.brands brand
      WHERE brand.id = citation_runs.brand_id
        AND brand.deleted_at IS NULL
        AND brand.user_id = nullif(coalesce(nullif((select current_setting('app.user_id', true)), ''), nullif((select current_setting('venturecite.user_id', true)), '')), '')
    )
  );

DROP POLICY IF EXISTS work_evidence_geo_rankings_select ON public.geo_rankings;
CREATE POLICY work_evidence_geo_rankings_select
  ON public.geo_rankings
  FOR SELECT
  TO venturecite_request
  USING (
    EXISTS (
      SELECT 1 FROM public.brands brand
      WHERE brand.id = geo_rankings.brand_id
        AND brand.deleted_at IS NULL
        AND brand.user_id = nullif(coalesce(nullif((select current_setting('app.user_id', true)), ''), nullif((select current_setting('venturecite.user_id', true)), '')), '')
    )
  );

DROP POLICY IF EXISTS work_evidence_brand_prompts_select ON public.brand_prompts;
CREATE POLICY work_evidence_brand_prompts_select
  ON public.brand_prompts
  FOR SELECT
  TO venturecite_request
  USING (
    EXISTS (
      SELECT 1 FROM public.brands brand
      WHERE brand.id = brand_prompts.brand_id
        AND brand.deleted_at IS NULL
        AND brand.user_id = nullif(coalesce(nullif((select current_setting('app.user_id', true)), ''), nullif((select current_setting('venturecite.user_id', true)), '')), '')
    )
  );

DROP POLICY IF EXISTS work_evidence_prompt_generations_select ON public.prompt_generations;
CREATE POLICY work_evidence_prompt_generations_select
  ON public.prompt_generations
  FOR SELECT
  TO venturecite_request
  USING (
    EXISTS (
      SELECT 1 FROM public.brands brand
      WHERE brand.id = prompt_generations.brand_id
        AND brand.deleted_at IS NULL
        AND brand.user_id = nullif(coalesce(nullif((select current_setting('app.user_id', true)), ''), nullif((select current_setting('venturecite.user_id', true)), '')), '')
    )
  );

DROP POLICY IF EXISTS work_evidence_bofu_content_select ON public.bofu_content;
CREATE POLICY work_evidence_bofu_content_select
  ON public.bofu_content
  FOR SELECT
  TO venturecite_request
  USING (
    EXISTS (
      SELECT 1 FROM public.brands brand
      WHERE brand.id = bofu_content.brand_id
        AND brand.deleted_at IS NULL
        AND brand.user_id = nullif(coalesce(nullif((select current_setting('app.user_id', true)), ''), nullif((select current_setting('venturecite.user_id', true)), '')), '')
    )
  );

DROP POLICY IF EXISTS work_evidence_tracked_content_urls_select ON public.tracked_content_urls;
CREATE POLICY work_evidence_tracked_content_urls_select
  ON public.tracked_content_urls
  FOR SELECT
  TO venturecite_request
  USING (
    EXISTS (
      SELECT 1 FROM public.brands brand
      WHERE brand.id = tracked_content_urls.brand_id
        AND brand.deleted_at IS NULL
        AND brand.user_id = nullif(coalesce(nullif((select current_setting('app.user_id', true)), ''), nullif((select current_setting('venturecite.user_id', true)), '')), '')
    )
  );
