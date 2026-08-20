CREATE TABLE "agent_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"task_type" text NOT NULL,
	"task_title" text NOT NULL,
	"task_description" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"assigned_to" text DEFAULT 'agent',
	"triggered_by" text NOT NULL,
	"automation_rule_id" varchar,
	"input_data" jsonb,
	"output_data" jsonb,
	"ai_model_used" text,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"estimated_credits" numeric(10, 4),
	"actual_credits" numeric(10, 4),
	"scheduled_for" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_commerce_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" varchar,
	"brand_id" varchar,
	"ai_platform" text NOT NULL,
	"session_id" text,
	"user_query" text,
	"product_mentioned" text,
	"clicked_through" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"ai_platform" text NOT NULL,
	"source_url" text NOT NULL,
	"source_domain" text NOT NULL,
	"source_name" text,
	"source_type" text NOT NULL,
	"prompt" text,
	"citation_context" text,
	"authority_score" integer DEFAULT 0 NOT NULL,
	"is_brand_mentioned" integer DEFAULT 0 NOT NULL,
	"sentiment" text DEFAULT 'neutral',
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_traffic_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"article_id" varchar,
	"ai_platform" text NOT NULL,
	"referrer_url" text,
	"landing_page" text NOT NULL,
	"user_agent" text,
	"session_duration" integer,
	"page_views" integer DEFAULT 1 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"converted" integer DEFAULT 0 NOT NULL,
	"conversion_type" text,
	"conversion_value" numeric(10, 2),
	"country" text,
	"device" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_setting_id" varchar,
	"brand_id" varchar,
	"alert_type" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"sent_via" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"alert_type" text NOT NULL,
	"is_enabled" integer DEFAULT 1 NOT NULL,
	"threshold" numeric(10, 2),
	"email_enabled" integer DEFAULT 0 NOT NULL,
	"email_address" text,
	"slack_enabled" integer DEFAULT 0 NOT NULL,
	"slack_webhook_url" text,
	"last_triggered" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"total_citations" integer DEFAULT 0 NOT NULL,
	"weekly_growth" numeric(5, 2) DEFAULT '0' NOT NULL,
	"avg_position" numeric(5, 2) DEFAULT '0' NOT NULL,
	"monthly_traffic" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"title" text NOT NULL,
	"slug" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"excerpt" text,
	"meta_description" text,
	"keywords" text[],
	"industry" text,
	"content_type" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"canonical_url" text,
	"featured_image" text,
	"author" text DEFAULT 'GEO Platform',
	"view_count" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"seo_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "automation_executions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_rule_id" varchar,
	"brand_id" varchar,
	"agent_task_id" varchar,
	"trigger_data" jsonb,
	"execution_status" text DEFAULT 'running' NOT NULL,
	"result_summary" text,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"rule_name" text NOT NULL,
	"rule_description" text,
	"trigger_type" text NOT NULL,
	"trigger_conditions" jsonb NOT NULL,
	"action_type" text NOT NULL,
	"action_config" jsonb NOT NULL,
	"is_enabled" integer DEFAULT 1 NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"max_executions_per_day" integer DEFAULT 10 NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"last_triggered_at" timestamp,
	"last_executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "beta_invite_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"access_tier" text DEFAULT 'beta' NOT NULL,
	"expires_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "beta_invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "bofu_content" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"content_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"primary_keyword" text,
	"compared_with" text[],
	"target_intent" text,
	"status" text DEFAULT 'draft',
	"ai_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "brand_fact_sheet" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"fact_category" text NOT NULL,
	"fact_key" text NOT NULL,
	"fact_value" text NOT NULL,
	"source_url" text,
	"last_verified" timestamp DEFAULT now() NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "brand_hallucinations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"ai_platform" text NOT NULL,
	"prompt" text NOT NULL,
	"claimed_statement" text NOT NULL,
	"actual_fact" text,
	"hallucination_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"category" text,
	"is_resolved" integer DEFAULT 0 NOT NULL,
	"remediation_steps" text[],
	"remediation_status" text DEFAULT 'pending',
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"verified_by" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "brand_mentions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"source_url" text NOT NULL,
	"source_title" text,
	"mention_context" text,
	"sentiment" text DEFAULT 'neutral',
	"sentiment_score" numeric(3, 2) DEFAULT '0',
	"engagement_score" integer,
	"author_username" text,
	"is_verified" integer DEFAULT 0 NOT NULL,
	"mentioned_at" timestamp,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "brand_prompts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"prompt" text NOT NULL,
	"rationale" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_visibility_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"ai_platform" text NOT NULL,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"share_of_voice" numeric(5, 2) DEFAULT '0',
	"visibility_score" integer DEFAULT 0 NOT NULL,
	"sentiment_positive" integer DEFAULT 0 NOT NULL,
	"sentiment_neutral" integer DEFAULT 0 NOT NULL,
	"sentiment_negative" integer DEFAULT 0 NOT NULL,
	"avg_sentiment_score" numeric(3, 2) DEFAULT '0',
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"company_name" text NOT NULL,
	"industry" text NOT NULL,
	"description" text,
	"website" text,
	"tone" text DEFAULT 'professional',
	"target_audience" text,
	"products" text[],
	"key_values" text[],
	"unique_selling_points" text[],
	"brand_voice" text,
	"sample_content" text,
	"name_variations" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citation_quality" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"article_id" varchar,
	"ai_platform" text NOT NULL,
	"prompt" text,
	"citation_url" text,
	"authority_score" integer DEFAULT 0 NOT NULL,
	"relevance_score" integer DEFAULT 0 NOT NULL,
	"recency_score" integer DEFAULT 0 NOT NULL,
	"position_score" integer DEFAULT 0 NOT NULL,
	"is_primary_citation" integer DEFAULT 0 NOT NULL,
	"total_quality_score" integer DEFAULT 0 NOT NULL,
	"source_type" text,
	"competing_citations" text[],
	"scored_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"source" text,
	"url" text,
	"platform" text,
	"keywords" text[],
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"group_name" text NOT NULL,
	"group_url" text,
	"title" text,
	"content" text NOT NULL,
	"post_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"post_type" text DEFAULT 'answer',
	"keywords" text[],
	"generated_by_ai" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"posted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "competitor_citation_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" varchar NOT NULL,
	"ai_platform" text NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"industry" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_generation_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"brand_id" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_payload" jsonb NOT NULL,
	"article_id" varchar,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "distributions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"platform_post_id" text,
	"platform_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"distributed_at" timestamp,
	"error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"article_id" varchar,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" text,
	"search_volume" integer,
	"ai_surface_score" integer,
	"is_optimized" integer DEFAULT 0 NOT NULL,
	"optimization_tips" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "geo_rankings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" varchar,
	"brand_prompt_id" varchar,
	"ai_platform" text NOT NULL,
	"prompt" text NOT NULL,
	"rank" integer,
	"is_cited" integer DEFAULT 0 NOT NULL,
	"citation_context" text,
	"citing_outlet_url" text,
	"citing_outlet_name" text,
	"sentiment" text DEFAULT 'neutral',
	"sentiment_score" numeric(3, 2) DEFAULT '0',
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "keyword_research" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"keyword" text NOT NULL,
	"search_volume" integer,
	"difficulty" integer,
	"opportunity_score" integer DEFAULT 50 NOT NULL,
	"ai_citation_potential" integer DEFAULT 50 NOT NULL,
	"intent" text DEFAULT 'informational',
	"category" text,
	"competitor_gap" integer DEFAULT 0 NOT NULL,
	"suggested_content_type" text DEFAULT 'article',
	"related_keywords" text[],
	"status" text DEFAULT 'discovered' NOT NULL,
	"content_generated" integer DEFAULT 0 NOT NULL,
	"article_id" varchar,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listicles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"source_publication" text,
	"list_position" integer,
	"total_list_items" integer,
	"is_included" integer DEFAULT 0 NOT NULL,
	"competitors_mentioned" text[],
	"keyword" text,
	"search_volume" integer,
	"domain_authority" integer,
	"last_checked" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "metrics_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"metric_type" text NOT NULL,
	"metric_value" numeric(10, 2) NOT NULL,
	"metric_details" jsonb,
	"snapshot_date" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"campaign_name" text NOT NULL,
	"campaign_type" text NOT NULL,
	"target_publication_id" varchar,
	"target_domain" text NOT NULL,
	"target_contact_email" text,
	"target_contact_name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"email_subject" text,
	"email_body" text,
	"pitch_angle" text,
	"proposed_topic" text,
	"linked_article_id" varchar,
	"authority_score" integer DEFAULT 0 NOT NULL,
	"expected_impact" text,
	"ai_generated_draft" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp,
	"last_follow_up_at" timestamp,
	"follow_up_count" integer DEFAULT 0 NOT NULL,
	"response_received_at" timestamp,
	"response_notes" text,
	"result_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "outreach_emails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar,
	"publication_target_id" varchar,
	"brand_id" varchar NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"email_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"replied_at" timestamp,
	"open_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"reply_content" text,
	"error" text,
	"tracking_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "prompt_portfolio" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"prompt" text NOT NULL,
	"category" text NOT NULL,
	"funnel_stage" text NOT NULL,
	"competitor_set" text[],
	"region" text DEFAULT 'global',
	"ai_platform" text NOT NULL,
	"is_brand_cited" integer DEFAULT 0 NOT NULL,
	"citation_position" integer,
	"share_of_answer" numeric(5, 2) DEFAULT '0',
	"sentiment" text DEFAULT 'neutral',
	"answer_volatility" integer DEFAULT 0,
	"consensus_score" integer DEFAULT 0,
	"last_checked" timestamp DEFAULT now() NOT NULL,
	"checked_history" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "prompt_test_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"prompt_portfolio_id" varchar,
	"prompt" text NOT NULL,
	"ai_platform" text NOT NULL,
	"response" text,
	"is_brand_cited" integer DEFAULT 0 NOT NULL,
	"citation_position" integer,
	"competitors_found" text[],
	"sentiment" text DEFAULT 'neutral',
	"share_of_answer" numeric(5, 2),
	"hallucination_detected" integer DEFAULT 0 NOT NULL,
	"hallucination_details" text,
	"sources_cited" jsonb,
	"run_status" text DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "publication_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_name" text NOT NULL,
	"outlet_domain" text NOT NULL,
	"industry" text NOT NULL,
	"total_citations" integer DEFAULT 0 NOT NULL,
	"ai_platform_breakdown" jsonb,
	"authority_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"trend_direction" text DEFAULT 'stable',
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_references" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_name" text NOT NULL,
	"outlet_domain" text NOT NULL,
	"outlet_url" text,
	"industry" text,
	"ai_platform" text NOT NULL,
	"article_id" varchar,
	"citation_count" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "publication_targets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"publication_name" text NOT NULL,
	"domain" text NOT NULL,
	"category" text NOT NULL,
	"industry" text,
	"domain_authority" integer DEFAULT 0 NOT NULL,
	"monthly_traffic" text,
	"accepts_guest_posts" integer DEFAULT 0 NOT NULL,
	"accepts_pr_pitches" integer DEFAULT 0 NOT NULL,
	"relevance_score" integer DEFAULT 0 NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_role" text,
	"contact_linkedin" text,
	"contact_twitter" text,
	"submission_url" text,
	"editorial_guidelines" text,
	"pitch_notes" text,
	"previous_outreach" integer DEFAULT 0 NOT NULL,
	"last_contacted_at" timestamp,
	"status" text DEFAULT 'discovered' NOT NULL,
	"discovered_by" text DEFAULT 'ai' NOT NULL,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "purchase_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commerce_session_id" varchar,
	"article_id" varchar,
	"brand_id" varchar,
	"ai_platform" text NOT NULL,
	"ecommerce_platform" text NOT NULL,
	"order_id" text,
	"revenue" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"product_name" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"customer_email" text,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"webhook_data" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"password_hash" text,
	"first_name" text,
	"last_name" text,
	"profile_image_url" text,
	"access_tier" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"beta_invite_code" text,
	"is_admin" integer DEFAULT 0 NOT NULL,
	"articles_used_this_month" integer DEFAULT 0 NOT NULL,
	"brands_used" integer DEFAULT 0 NOT NULL,
	"usage_reset_date" timestamp DEFAULT now(),
	"email_verified" integer DEFAULT 0 NOT NULL,
	"weekly_report_enabled" integer DEFAULT 1 NOT NULL,
	"last_weekly_report_sent_at" timestamp,
	"buffer_access_token" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'landing',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wikipedia_mentions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" varchar NOT NULL,
	"page_title" text NOT NULL,
	"page_url" text NOT NULL,
	"mention_context" text,
	"mention_type" text,
	"section_name" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"last_verified" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_commerce_sessions" ADD CONSTRAINT "ai_commerce_sessions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_commerce_sessions" ADD CONSTRAINT "ai_commerce_sessions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sources" ADD CONSTRAINT "ai_sources_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_traffic_sessions" ADD CONSTRAINT "ai_traffic_sessions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_traffic_sessions" ADD CONSTRAINT "ai_traffic_sessions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_setting_id_alert_settings_id_fk" FOREIGN KEY ("alert_setting_id") REFERENCES "public"."alert_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_automation_rule_id_automation_rules_id_fk" FOREIGN KEY ("automation_rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_agent_task_id_agent_tasks_id_fk" FOREIGN KEY ("agent_task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bofu_content" ADD CONSTRAINT "bofu_content_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_fact_sheet" ADD CONSTRAINT "brand_fact_sheet_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_hallucinations" ADD CONSTRAINT "brand_hallucinations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_mentions" ADD CONSTRAINT "brand_mentions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_prompts" ADD CONSTRAINT "brand_prompts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_visibility_snapshots" ADD CONSTRAINT "brand_visibility_snapshots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_quality" ADD CONSTRAINT "citation_quality_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_quality" ADD CONSTRAINT "citation_quality_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_citation_snapshots" ADD CONSTRAINT "competitor_citation_snapshots_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD CONSTRAINT "content_generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD CONSTRAINT "content_generation_jobs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD CONSTRAINT "content_generation_jobs_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_rankings" ADD CONSTRAINT "geo_rankings_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_rankings" ADD CONSTRAINT "geo_rankings_brand_prompt_id_brand_prompts_id_fk" FOREIGN KEY ("brand_prompt_id") REFERENCES "public"."brand_prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_research" ADD CONSTRAINT "keyword_research_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_research" ADD CONSTRAINT "keyword_research_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listicles" ADD CONSTRAINT "listicles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_history" ADD CONSTRAINT "metrics_history_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_linked_article_id_articles_id_fk" FOREIGN KEY ("linked_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_campaign_id_outreach_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_publication_target_id_publication_targets_id_fk" FOREIGN KEY ("publication_target_id") REFERENCES "public"."publication_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_portfolio" ADD CONSTRAINT "prompt_portfolio_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_test_runs" ADD CONSTRAINT "prompt_test_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_test_runs" ADD CONSTRAINT "prompt_test_runs_prompt_portfolio_id_prompt_portfolio_id_fk" FOREIGN KEY ("prompt_portfolio_id") REFERENCES "public"."prompt_portfolio"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_references" ADD CONSTRAINT "publication_references_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_targets" ADD CONSTRAINT "publication_targets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_commerce_session_id_ai_commerce_sessions_id_fk" FOREIGN KEY ("commerce_session_id") REFERENCES "public"."ai_commerce_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wikipedia_mentions" ADD CONSTRAINT "wikipedia_mentions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_tasks_brand_id_idx" ON "agent_tasks" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "agent_tasks_status_idx" ON "agent_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_commerce_sessions_brand_id_idx" ON "ai_commerce_sessions" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "ai_sources_brand_id_idx" ON "ai_sources" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "ai_traffic_sessions_brand_id_idx" ON "ai_traffic_sessions" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "alert_history_brand_id_idx" ON "alert_history" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "alert_settings_brand_id_idx" ON "alert_settings" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "articles_brand_id_idx" ON "articles" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "articles_status_idx" ON "articles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_brand_slug_idx" ON "articles" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "automation_executions_rule_id_idx" ON "automation_executions" USING btree ("automation_rule_id");--> statement-breakpoint
CREATE INDEX "automation_executions_brand_id_idx" ON "automation_executions" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "automation_rules_brand_id_idx" ON "automation_rules" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "bofu_content_brand_id_idx" ON "bofu_content" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_fact_sheet_brand_id_idx" ON "brand_fact_sheet" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_hallucinations_brand_id_idx" ON "brand_hallucinations" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_mentions_brand_id_idx" ON "brand_mentions" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_prompts_brand_id_idx" ON "brand_prompts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_visibility_snapshots_brand_id_idx" ON "brand_visibility_snapshots" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brands_user_id_idx" ON "brands" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "citation_quality_brand_id_idx" ON "citation_quality" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "citations_user_id_idx" ON "citations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "community_posts_brand_id_idx" ON "community_posts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "competitor_citation_snapshots_competitor_id_idx" ON "competitor_citation_snapshots" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "competitors_brand_id_idx" ON "competitors" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "content_gen_jobs_user_status_idx" ON "content_generation_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "content_gen_jobs_status_idx" ON "content_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "distributions_article_id_idx" ON "distributions" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "faq_items_brand_id_idx" ON "faq_items" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "geo_rankings_article_id_idx" ON "geo_rankings" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "geo_rankings_brand_prompt_id_idx" ON "geo_rankings" USING btree ("brand_prompt_id");--> statement-breakpoint
CREATE INDEX "geo_rankings_ai_platform_idx" ON "geo_rankings" USING btree ("ai_platform");--> statement-breakpoint
CREATE INDEX "keyword_research_brand_id_idx" ON "keyword_research" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "listicles_brand_id_idx" ON "listicles" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "metrics_history_brand_id_idx" ON "metrics_history" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "outreach_campaigns_brand_id_idx" ON "outreach_campaigns" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "outreach_emails_brand_id_idx" ON "outreach_emails" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "prompt_portfolio_brand_id_idx" ON "prompt_portfolio" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "prompt_test_runs_brand_id_idx" ON "prompt_test_runs" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "publication_targets_brand_id_idx" ON "publication_targets" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "purchase_events_brand_id_idx" ON "purchase_events" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "wikipedia_mentions_brand_id_idx" ON "wikipedia_mentions" USING btree ("brand_id");