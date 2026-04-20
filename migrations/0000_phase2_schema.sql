-- Phase 2 schema: create every table declared in shared/schema.ts that
-- earlier migrations only ALTERed (indexes / RLS) without ever creating.
-- Uses IF NOT EXISTS throughout so environments that already ran
-- `drizzle-kit push` are unaffected; only fresh DBs get the CREATE.

-- ──────────────── Revenue & commerce (phase 2) ────────────────

CREATE TABLE IF NOT EXISTS brand_visibility_snapshots (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  ai_platform         text NOT NULL,
  mention_count       integer NOT NULL DEFAULT 0,
  citation_count      integer NOT NULL DEFAULT 0,
  share_of_voice      numeric(5,2) DEFAULT 0,
  visibility_score    integer NOT NULL DEFAULT 0,
  sentiment_positive  integer NOT NULL DEFAULT 0,
  sentiment_neutral   integer NOT NULL DEFAULT 0,
  sentiment_negative  integer NOT NULL DEFAULT 0,
  avg_sentiment_score numeric(3,2) DEFAULT 0,
  snapshot_date       timestamp NOT NULL DEFAULT now(),
  metadata            jsonb
);
CREATE INDEX IF NOT EXISTS brand_visibility_snapshots_brand_id_idx
  ON brand_visibility_snapshots(brand_id);

CREATE TABLE IF NOT EXISTS ai_commerce_sessions (
  id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id        varchar REFERENCES articles(id) ON DELETE CASCADE,
  brand_id          varchar REFERENCES brands(id) ON DELETE CASCADE,
  ai_platform       text NOT NULL,
  session_id        text,
  user_query        text,
  product_mentioned text,
  clicked_through   integer NOT NULL DEFAULT 0,
  created_at        timestamp NOT NULL DEFAULT now(),
  metadata          jsonb
);
CREATE INDEX IF NOT EXISTS ai_commerce_sessions_brand_id_idx
  ON ai_commerce_sessions(brand_id);

CREATE TABLE IF NOT EXISTS purchase_events (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  commerce_session_id  varchar REFERENCES ai_commerce_sessions(id) ON DELETE SET NULL,
  article_id           varchar REFERENCES articles(id) ON DELETE SET NULL,
  brand_id             varchar REFERENCES brands(id) ON DELETE CASCADE,
  ai_platform          text NOT NULL,
  ecommerce_platform   text NOT NULL,
  order_id             text,
  revenue              numeric(10,2) NOT NULL,
  currency             text NOT NULL DEFAULT 'USD',
  product_name         text,
  quantity             integer NOT NULL DEFAULT 1,
  customer_email       text,
  purchased_at         timestamp NOT NULL DEFAULT now(),
  webhook_data         jsonb,
  metadata             jsonb
);
CREATE INDEX IF NOT EXISTS purchase_events_brand_id_idx
  ON purchase_events(brand_id);

-- ──────────────── Publication intelligence ────────────────

CREATE TABLE IF NOT EXISTS publication_references (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_name    text NOT NULL,
  outlet_domain  text NOT NULL,
  outlet_url     text,
  industry       text,
  ai_platform    text NOT NULL,
  article_id     varchar REFERENCES articles(id) ON DELETE SET NULL,
  citation_count integer NOT NULL DEFAULT 1,
  last_seen_at   timestamp NOT NULL DEFAULT now(),
  metadata       jsonb
);

CREATE TABLE IF NOT EXISTS publication_metrics (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_name            text NOT NULL,
  outlet_domain          text NOT NULL,
  industry               text NOT NULL,
  total_citations        integer NOT NULL DEFAULT 0,
  ai_platform_breakdown  jsonb,
  authority_score        numeric(5,2) NOT NULL DEFAULT 0,
  trend_direction        text DEFAULT 'stable',
  last_updated           timestamp NOT NULL DEFAULT now()
);

-- ──────────────── Competitors ────────────────

CREATE TABLE IF NOT EXISTS competitors (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name        text NOT NULL,
  domain      text NOT NULL,
  industry    text,
  description text,
  created_at  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS competitors_brand_id_idx ON competitors(brand_id);

CREATE TABLE IF NOT EXISTS competitor_citation_snapshots (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id  varchar NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  ai_platform    text NOT NULL,
  citation_count integer NOT NULL DEFAULT 0,
  snapshot_date  timestamp NOT NULL DEFAULT now(),
  metadata       jsonb
);
CREATE INDEX IF NOT EXISTS competitor_citation_snapshots_competitor_id_idx
  ON competitor_citation_snapshots(competitor_id);

-- ──────────────── GEO tools ────────────────

CREATE TABLE IF NOT EXISTS listicles (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id               varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title                  text NOT NULL,
  url                    text NOT NULL,
  source_publication     text,
  list_position          integer,
  total_list_items       integer,
  is_included            integer NOT NULL DEFAULT 0,
  competitors_mentioned  text[],
  keyword                text,
  search_volume          integer,
  domain_authority       integer,
  last_checked           timestamp NOT NULL DEFAULT now(),
  created_at             timestamp NOT NULL DEFAULT now(),
  metadata               jsonb
);
CREATE INDEX IF NOT EXISTS listicles_brand_id_idx ON listicles(brand_id);

CREATE TABLE IF NOT EXISTS wikipedia_mentions (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  page_title       text NOT NULL,
  page_url         text NOT NULL,
  mention_context  text,
  mention_type     text,
  section_name     text,
  is_active        integer NOT NULL DEFAULT 1,
  last_verified    timestamp NOT NULL DEFAULT now(),
  created_at       timestamp NOT NULL DEFAULT now(),
  metadata         jsonb
);
CREATE INDEX IF NOT EXISTS wikipedia_mentions_brand_id_idx ON wikipedia_mentions(brand_id);

CREATE TABLE IF NOT EXISTS bofu_content (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  content_type    text NOT NULL,
  title           text NOT NULL,
  content         text NOT NULL,
  primary_keyword text,
  compared_with   text[],
  target_intent   text,
  status          text DEFAULT 'draft',
  ai_score        integer,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  metadata        jsonb
);
CREATE INDEX IF NOT EXISTS bofu_content_brand_id_idx ON bofu_content(brand_id);

CREATE TABLE IF NOT EXISTS faq_items (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  article_id           varchar REFERENCES articles(id) ON DELETE SET NULL,
  question             text NOT NULL,
  answer               text NOT NULL,
  category             text,
  search_volume        integer,
  ai_surface_score     integer,
  is_optimized         integer NOT NULL DEFAULT 0,
  optimization_tips    text[],
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now(),
  metadata             jsonb
);
CREATE INDEX IF NOT EXISTS faq_items_brand_id_idx ON faq_items(brand_id);

CREATE TABLE IF NOT EXISTS brand_mentions (
  id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform          text NOT NULL,
  source_url        text NOT NULL,
  source_title      text,
  mention_context   text,
  sentiment         text DEFAULT 'neutral',
  sentiment_score   numeric(3,2) DEFAULT 0,
  engagement_score  integer,
  author_username   text,
  is_verified       integer NOT NULL DEFAULT 0,
  mentioned_at      timestamp,
  discovered_at     timestamp NOT NULL DEFAULT now(),
  metadata          jsonb
);
CREATE INDEX IF NOT EXISTS brand_mentions_brand_id_idx ON brand_mentions(brand_id);

-- ──────────────── AI Intelligence ────────────────

CREATE TABLE IF NOT EXISTS prompt_portfolio (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt             text NOT NULL,
  category           text NOT NULL,
  funnel_stage       text NOT NULL,
  competitor_set     text[],
  region             text DEFAULT 'global',
  ai_platform        text NOT NULL,
  is_brand_cited     integer NOT NULL DEFAULT 0,
  citation_position  integer,
  share_of_answer    numeric(5,2) DEFAULT 0,
  sentiment          text DEFAULT 'neutral',
  answer_volatility  integer DEFAULT 0,
  consensus_score    integer DEFAULT 0,
  last_checked       timestamp NOT NULL DEFAULT now(),
  checked_history    jsonb,
  created_at         timestamp NOT NULL DEFAULT now(),
  metadata           jsonb
);
CREATE INDEX IF NOT EXISTS prompt_portfolio_brand_id_idx ON prompt_portfolio(brand_id);

CREATE TABLE IF NOT EXISTS citation_quality (
  id                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  article_id            varchar REFERENCES articles(id) ON DELETE SET NULL,
  ai_platform           text NOT NULL,
  prompt                text,
  citation_url          text,
  authority_score       integer NOT NULL DEFAULT 0,
  relevance_score       integer NOT NULL DEFAULT 0,
  recency_score         integer NOT NULL DEFAULT 0,
  position_score        integer NOT NULL DEFAULT 0,
  is_primary_citation   integer NOT NULL DEFAULT 0,
  total_quality_score   integer NOT NULL DEFAULT 0,
  source_type           text,
  competing_citations   text[],
  scored_at             timestamp NOT NULL DEFAULT now(),
  metadata              jsonb
);
CREATE INDEX IF NOT EXISTS citation_quality_brand_id_idx ON citation_quality(brand_id);

CREATE TABLE IF NOT EXISTS brand_hallucinations (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  ai_platform          text NOT NULL,
  prompt               text NOT NULL,
  claimed_statement    text NOT NULL,
  actual_fact          text,
  hallucination_type   text NOT NULL,
  severity             text NOT NULL DEFAULT 'medium',
  category             text,
  is_resolved          integer NOT NULL DEFAULT 0,
  remediation_steps    text[],
  remediation_status   text DEFAULT 'pending',
  detected_at          timestamp NOT NULL DEFAULT now(),
  resolved_at          timestamp,
  verified_by          text,
  metadata             jsonb
);
CREATE INDEX IF NOT EXISTS brand_hallucinations_brand_id_idx ON brand_hallucinations(brand_id);

CREATE TABLE IF NOT EXISTS brand_fact_sheet (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  fact_category  text NOT NULL,
  fact_key       text NOT NULL,
  fact_value     text NOT NULL,
  source_url     text,
  last_verified  timestamp NOT NULL DEFAULT now(),
  is_active      integer NOT NULL DEFAULT 1,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now(),
  metadata       jsonb
);
CREATE INDEX IF NOT EXISTS brand_fact_sheet_brand_id_idx ON brand_fact_sheet(brand_id);

CREATE TABLE IF NOT EXISTS metrics_history (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  metric_type     text NOT NULL,
  metric_value    numeric(10,2) NOT NULL,
  metric_details  jsonb,
  snapshot_date   timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS metrics_history_brand_id_idx ON metrics_history(brand_id);

CREATE TABLE IF NOT EXISTS alert_settings (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  alert_type         text NOT NULL,
  is_enabled         integer NOT NULL DEFAULT 1,
  threshold          numeric(10,2),
  email_enabled      integer NOT NULL DEFAULT 0,
  email_address      text,
  slack_enabled      integer NOT NULL DEFAULT 0,
  slack_webhook_url  text,
  last_triggered     timestamp,
  created_at         timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_settings_brand_id_idx ON alert_settings(brand_id);

CREATE TABLE IF NOT EXISTS alert_history (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_setting_id   varchar REFERENCES alert_settings(id) ON DELETE CASCADE,
  brand_id           varchar REFERENCES brands(id) ON DELETE CASCADE,
  alert_type         text NOT NULL,
  message            text NOT NULL,
  details            jsonb,
  sent_via           text NOT NULL,
  sent_at            timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_history_brand_id_idx ON alert_history(brand_id);

-- ──────────────── AI Traffic & Sources ────────────────

CREATE TABLE IF NOT EXISTS ai_sources (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  ai_platform          text NOT NULL,
  source_url           text NOT NULL,
  source_domain        text NOT NULL,
  source_name          text,
  source_type          text NOT NULL,
  prompt               text,
  citation_context     text,
  authority_score      integer NOT NULL DEFAULT 0,
  is_brand_mentioned   integer NOT NULL DEFAULT 0,
  sentiment            text DEFAULT 'neutral',
  discovered_at        timestamp NOT NULL DEFAULT now(),
  last_seen_at         timestamp NOT NULL DEFAULT now(),
  occurrence_count     integer NOT NULL DEFAULT 1,
  metadata             jsonb
);
CREATE INDEX IF NOT EXISTS ai_sources_brand_id_idx ON ai_sources(brand_id);

CREATE TABLE IF NOT EXISTS ai_traffic_sessions (
  id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  article_id        varchar REFERENCES articles(id) ON DELETE SET NULL,
  ai_platform       text NOT NULL,
  referrer_url      text,
  landing_page      text NOT NULL,
  user_agent        text,
  session_duration  integer,
  page_views        integer NOT NULL DEFAULT 1,
  bounced           integer NOT NULL DEFAULT 0,
  converted         integer NOT NULL DEFAULT 0,
  conversion_type   text,
  conversion_value  numeric(10,2),
  country           text,
  device            text,
  created_at        timestamp NOT NULL DEFAULT now(),
  metadata          jsonb
);
CREATE INDEX IF NOT EXISTS ai_traffic_sessions_brand_id_idx ON ai_traffic_sessions(brand_id);

CREATE TABLE IF NOT EXISTS prompt_test_runs (
  id                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt_portfolio_id     varchar REFERENCES prompt_portfolio(id) ON DELETE SET NULL,
  prompt                  text NOT NULL,
  ai_platform             text NOT NULL,
  response                text,
  is_brand_cited          integer NOT NULL DEFAULT 0,
  citation_position       integer,
  competitors_found       text[],
  sentiment               text DEFAULT 'neutral',
  share_of_answer         numeric(5,2),
  hallucination_detected  integer NOT NULL DEFAULT 0,
  hallucination_details   text,
  sources_cited           jsonb,
  run_status              text NOT NULL DEFAULT 'pending',
  scheduled_at            timestamp,
  completed_at            timestamp,
  created_at              timestamp NOT NULL DEFAULT now(),
  error                   text,
  metadata                jsonb
);
CREATE INDEX IF NOT EXISTS prompt_test_runs_brand_id_idx ON prompt_test_runs(brand_id);

-- ──────────────── Agent / automation ────────────────

CREATE TABLE IF NOT EXISTS agent_tasks (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  task_type            text NOT NULL,
  task_title           text NOT NULL,
  task_description     text,
  priority             text NOT NULL DEFAULT 'medium',
  status               text NOT NULL DEFAULT 'queued',
  assigned_to          text DEFAULT 'agent',
  triggered_by         text NOT NULL,
  automation_rule_id   varchar,
  input_data           jsonb,
  output_data          jsonb,
  ai_model_used        text,
  tokens_used          integer NOT NULL DEFAULT 0,
  estimated_credits    numeric(10,4),
  actual_credits       numeric(10,4),
  scheduled_for        timestamp,
  started_at           timestamp,
  completed_at         timestamp,
  error                text,
  retry_count          integer NOT NULL DEFAULT 0,
  max_retries          integer NOT NULL DEFAULT 3,
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now(),
  metadata             jsonb
);
CREATE INDEX IF NOT EXISTS agent_tasks_brand_id_idx ON agent_tasks(brand_id);
CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON agent_tasks(status);

CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id               varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  campaign_name          text NOT NULL,
  campaign_type          text NOT NULL,
  target_publication_id  varchar,
  target_domain          text NOT NULL,
  target_contact_email   text,
  target_contact_name    text,
  status                 text NOT NULL DEFAULT 'draft',
  email_subject          text,
  email_body             text,
  pitch_angle            text,
  proposed_topic         text,
  linked_article_id      varchar REFERENCES articles(id) ON DELETE SET NULL,
  authority_score        integer NOT NULL DEFAULT 0,
  expected_impact        text,
  ai_generated_draft     integer NOT NULL DEFAULT 0,
  sent_at                timestamp,
  last_follow_up_at      timestamp,
  follow_up_count        integer NOT NULL DEFAULT 0,
  response_received_at   timestamp,
  response_notes         text,
  result_url             text,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now(),
  metadata               jsonb
);
CREATE INDEX IF NOT EXISTS outreach_campaigns_brand_id_idx ON outreach_campaigns(brand_id);

CREATE TABLE IF NOT EXISTS publication_targets (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id               varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  publication_name       text NOT NULL,
  domain                 text NOT NULL,
  category               text NOT NULL,
  industry               text,
  domain_authority       integer NOT NULL DEFAULT 0,
  monthly_traffic        text,
  accepts_guest_posts    integer NOT NULL DEFAULT 0,
  accepts_pr_pitches     integer NOT NULL DEFAULT 0,
  relevance_score        integer NOT NULL DEFAULT 0,
  contact_name           text,
  contact_email          text,
  contact_role           text,
  contact_linkedin       text,
  contact_twitter        text,
  submission_url         text,
  editorial_guidelines   text,
  pitch_notes            text,
  previous_outreach      integer NOT NULL DEFAULT 0,
  last_contacted_at      timestamp,
  status                 text NOT NULL DEFAULT 'discovered',
  discovered_by          text NOT NULL DEFAULT 'ai',
  discovered_at          timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now(),
  metadata               jsonb
);
CREATE INDEX IF NOT EXISTS publication_targets_brand_id_idx ON publication_targets(brand_id);

CREATE TABLE IF NOT EXISTS outreach_emails (
  id                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id             varchar REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  publication_target_id   varchar REFERENCES publication_targets(id) ON DELETE SET NULL,
  brand_id                varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  recipient_email         text NOT NULL,
  recipient_name          text,
  subject                 text NOT NULL,
  body                    text NOT NULL,
  email_type              text NOT NULL,
  status                  text NOT NULL DEFAULT 'draft',
  scheduled_for           timestamp,
  sent_at                 timestamp,
  opened_at               timestamp,
  clicked_at              timestamp,
  replied_at              timestamp,
  open_count              integer NOT NULL DEFAULT 0,
  click_count             integer NOT NULL DEFAULT 0,
  reply_content           text,
  error                   text,
  tracking_id             text,
  created_at              timestamp NOT NULL DEFAULT now(),
  metadata                jsonb
);
CREATE INDEX IF NOT EXISTS outreach_emails_brand_id_idx ON outreach_emails(brand_id);

CREATE TABLE IF NOT EXISTS automation_rules (
  id                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                 varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  rule_name                text NOT NULL,
  rule_description         text,
  trigger_type             text NOT NULL,
  trigger_conditions       jsonb NOT NULL,
  action_type              text NOT NULL,
  action_config            jsonb NOT NULL,
  is_enabled               integer NOT NULL DEFAULT 1,
  priority                 integer NOT NULL DEFAULT 50,
  cooldown_minutes         integer NOT NULL DEFAULT 60,
  max_executions_per_day   integer NOT NULL DEFAULT 10,
  execution_count          integer NOT NULL DEFAULT 0,
  last_triggered_at        timestamp,
  last_executed_at         timestamp,
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now(),
  metadata                 jsonb
);
CREATE INDEX IF NOT EXISTS automation_rules_brand_id_idx ON automation_rules(brand_id);

CREATE TABLE IF NOT EXISTS automation_executions (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_rule_id   varchar REFERENCES automation_rules(id) ON DELETE CASCADE,
  brand_id             varchar REFERENCES brands(id) ON DELETE CASCADE,
  agent_task_id        varchar REFERENCES agent_tasks(id) ON DELETE SET NULL,
  trigger_data         jsonb,
  execution_status     text NOT NULL DEFAULT 'running',
  result_summary       text,
  error_message        text,
  started_at           timestamp NOT NULL DEFAULT now(),
  completed_at         timestamp,
  metadata             jsonb
);
CREATE INDEX IF NOT EXISTS automation_executions_rule_id_idx
  ON automation_executions(automation_rule_id);
CREATE INDEX IF NOT EXISTS automation_executions_brand_id_idx
  ON automation_executions(brand_id);

-- ──────────────── Community engagement ────────────────

CREATE TABLE IF NOT EXISTS community_posts (
  id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform          text NOT NULL,
  group_name        text NOT NULL,
  group_url         text,
  title             text,
  content           text NOT NULL,
  post_url          text,
  status            text NOT NULL DEFAULT 'draft',
  post_type         text DEFAULT 'answer',
  keywords          text[],
  generated_by_ai   integer NOT NULL DEFAULT 0,
  created_at        timestamp NOT NULL DEFAULT now(),
  posted_at         timestamp
);
CREATE INDEX IF NOT EXISTS community_posts_brand_id_idx ON community_posts(brand_id);
