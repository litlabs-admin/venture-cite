-- v2: add diagnostics + retry_count to brand_fact_scrape_runs
ALTER TABLE brand_fact_scrape_runs
  ADD COLUMN IF NOT EXISTS diagnostics JSONB,
  ADD COLUMN IF NOT EXISTS retry_count SMALLINT NOT NULL DEFAULT 0;

-- v2: widen triggered_by check constraint with new origin values
ALTER TABLE brand_fact_scrape_runs
  DROP CONSTRAINT IF EXISTS brand_fact_scrape_runs_triggered_by_check;
ALTER TABLE brand_fact_scrape_runs
  ADD CONSTRAINT brand_fact_scrape_runs_triggered_by_check
  CHECK (triggered_by IN (
    'welcome_confirm','brand_create','manual_rescrape','cron_refresh',
    'cron_backstop','onboarding','paste','user_rescrape'
  ));

-- v2: widen pages.status to include new skipped reasons emitted by /scrape-one
ALTER TABLE brand_fact_scrape_pages
  DROP CONSTRAINT IF EXISTS brand_fact_scrape_pages_status_check;
ALTER TABLE brand_fact_scrape_pages
  ADD CONSTRAINT brand_fact_scrape_pages_status_check
  CHECK (status IN (
    'pending','fetching','extracting','done','failed',
    'skipped_robots','skipped_lang','skipped_spa',
    'skipped_non_html','skipped_soft_404','skipped_cookie_wall',
    'skipped_waf','skipped_canonical','skipped_redirect_loop','skipped_hollow_shell'
  ));
