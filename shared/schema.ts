import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  bigint,
  timestamp,
  jsonb,
  numeric,
  index,
  uniqueIndex,
  boolean,
  primaryKey,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  timezone: text("timezone"),
  profileImageUrl: text("profile_image_url"),
  accessTier: text("access_tier").default("free").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  betaInviteCode: text("beta_invite_code"),
  isAdmin: integer("is_admin").default(0).notNull(),
  articlesUsedThisMonth: integer("articles_used_this_month").default(0).notNull(),
  brandsUsed: integer("brands_used").default(0).notNull(),
  usageResetDate: timestamp("usage_reset_date").defaultNow(),
  emailVerified: integer("email_verified").default(0).notNull(),
  weeklyReportEnabled: integer("weekly_report_enabled").default(1).notNull(),
  lastWeeklyReportSentAt: timestamp("last_weekly_report_sent_at"),
  visibilityGuideVisitedAt: timestamp("visibility_guide_visited_at"),
  // Wave 4.7: free-form bag of onboarding flags, persisted server-side
  // so dismiss state syncs across devices. Keys defined in
  // server/routes/onboarding.ts (see ONBOARDING_FIELDS).
  onboardingState: jsonb("onboarding_state").default({}).notNull(),
  bufferAccessToken: text("buffer_access_token"),
  // Soft-delete (Wave 2.2). Set when the user requests account deletion
  // — the row stays for the 30-day grace period so an admin can restore
  // accidental deletions; the daily cron then hard-deletes after grace.
  deletedAt: timestamp("deleted_at"),
  deletionScheduledFor: timestamp("deletion_scheduled_for"),
  // Email deliverability state (Wave 3.6). Values: 'active', 'bounced',
  // 'complained', 'unsubscribed'. The email service refuses to send
  // when this isn't 'active' so we don't keep blasting addresses that
  // hurt our domain reputation.
  emailStatus: text("email_status").default("active").notNull(),
  // Wave 4 / Plan 4 Task 3: first non-null value is set on the user's
  // first verified login. The welcome-email trigger fires exactly once
  // (when this is NULL pre-login) and then this stamp is set. Existing
  // rows are backfilled to NOW() in migration 0054 so we don't spam old
  // accounts.
  lastLoginAt: timestamp("last_login_at"),
  // Plan 4 audit (BUG #13): dedicated welcome-email gate so
  // `lastLoginAt` recovers its literal meaning. NULL = welcome email
  // has not been sent yet; stamped atomically with the welcome-email
  // dispatch on first login. Existing rows backfilled to NOW() in
  // migration 0056 so we don't spam pre-existing accounts.
  welcomedAt: timestamp("welcomed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usageLimits = {
  free: { articlesPerMonth: 5, maxBrands: 1 },
  beta: { articlesPerMonth: 20, maxBrands: 3 },
  pro: { articlesPerMonth: 40, maxBrands: 5 },
  enterprise: { articlesPerMonth: 200, maxBrands: -1 },
  admin: { articlesPerMonth: -1, maxBrands: -1 },
};

export type UpsertUser = typeof users.$inferInsert;

export const betaInviteCodes = pgTable("beta_invite_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses").default(1).notNull(),
  usedCount: integer("used_count").default(0).notNull(),
  accessTier: text("access_tier").default("beta").notNull(),
  expiresAt: timestamp("expires_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type BetaInviteCode = typeof betaInviteCodes.$inferSelect;
export type InsertBetaInviteCode = typeof betaInviteCodes.$inferInsert;

export const waitlist = pgTable("waitlist", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  source: text("source").default("landing"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWaitlistSchema = createInsertSchema(waitlist).omit({
  id: true,
  createdAt: true,
});
export type Waitlist = typeof waitlist.$inferSelect;
export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;

export const citations = pgTable(
  "citations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
    source: text("source"),
    url: text("url"),
    platform: text("platform"),
    keywords: text("keywords").array(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("citations_user_id_idx").on(table.userId)],
);

export const analytics = pgTable("analytics", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  totalCitations: integer("total_citations").default(0).notNull(),
  weeklyGrowth: numeric("weekly_growth", { precision: 5, scale: 2 }).default("0").notNull(),
  avgPosition: numeric("avg_position", { precision: 5, scale: 2 }).default("0").notNull(),
  monthlyTraffic: integer("monthly_traffic").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const brands = pgTable(
  "brands",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    companyName: text("company_name").notNull(),
    industry: text("industry").notNull(),
    factScrapeEnabled: boolean("fact_scrape_enabled").notNull().default(true),
    description: text("description"),
    website: text("website"),
    tone: text("tone").default("professional"),
    targetAudience: text("target_audience"),
    products: text("products").array(),
    keyValues: text("key_values").array(),
    uniqueSellingPoints: text("unique_selling_points").array(),
    brandVoice: text("brand_voice"),
    sampleContent: text("sample_content"),
    nameVariations: text("name_variations").array(),
    logoUrl: text("logo_url"),
    autopilotStatus: text("autopilot_status").default("idle"),
    autopilotStep: integer("autopilot_step").default(0),
    autopilotStartedAt: timestamp("autopilot_started_at"),
    autopilotCompletedAt: timestamp("autopilot_completed_at"),
    autopilotError: text("autopilot_error"),
    autopilotProgress: jsonb("autopilot_progress"),
    autoCitationSchedule: text("auto_citation_schedule").default("off").notNull(), // off | weekly | biweekly | monthly
    autoCitationDay: integer("auto_citation_day").default(0).notNull(), // 0=Sun, 1=Mon, ... 6=Sat
    // Wave 9: hour of day (UTC) the scheduled run fires + active toggle
    // (pause without losing the day/hour) + status of the most recent
    // scheduled run. See migration 0037_citation_schedule_v2.sql.
    autoCitationHour: integer("auto_citation_hour").default(9).notNull(),
    autoCitationActive: boolean("auto_citation_active").default(true).notNull(),
    lastAutoCitationAt: timestamp("last_auto_citation_at"),
    lastAutoCitationStatus: text("last_auto_citation_status"),
    // Wave 4.4: optimistic-lock version. Bumped on every write; client
    // sends `expectedVersion` and the UPDATE matches `WHERE version = $`,
    // returning 409 on mismatch.
    version: integer("version").default(0).notNull(),
    // Wave 4.5: soft-delete window. DELETE handler sets these; cron
    // hard-deletes after deletion_scheduled_for elapses. Filters
    // (`deleted_at IS NULL`) keep deleted brands out of GET responses.
    deletedAt: timestamp("deleted_at"),
    deletionScheduledFor: timestamp("deletion_scheduled_for"),
    // Mentions rebuild (0050): per-brand opt-in for daily auto-scan.
    monitorMentions: boolean("monitor_mentions").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("brands_user_id_idx").on(table.userId)],
);

// Articles are the single source of truth for user-authored content.
// Wave 7 (content unification) collapsed the old `content_drafts` table into
// this one — see migration 0033. Lifecycle: draft → generating → ready
// (or failed). Drafts have no content yet; generating jobs are linked via
// `jobId`; ready articles have content + at least one row in
// `article_revisions`.
export const articles = pgTable(
  "articles",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    // title/content are nullable so a draft article can exist before either
    // is filled in. The worker writes both on transition to 'ready'.
    title: text("title"),
    content: text("content"),
    excerpt: text("excerpt"),
    metaDescription: text("meta_description"),
    keywords: text("keywords").array(),
    industry: text("industry"),
    contentType: text("content_type"),
    featuredImage: text("featured_image"),
    author: text("author").default("GEO Platform"),
    viewCount: integer("view_count").default(0).notNull(),
    citationCount: integer("citation_count").default(0).notNull(),
    // Wave 4.4: optimistic-lock version (see brands.version).
    version: integer("version").default(0).notNull(),
    // Wave 7: lifecycle + form-state fields absorbed from content_drafts.
    status: text("status").default("ready").notNull(), // 'draft'|'generating'|'ready'|'failed'
    jobId: varchar("job_id"), // soft FK → content_generation_jobs.id, set while generating
    targetCustomers: text("target_customers"),
    geography: text("geography"),
    contentStyle: text("content_style").default("b2c"),
    // Where this article actually lives on the user's own site (their CMS
    // or blog URL). Replaces the old slug-based fake URL.
    externalUrl: text("external_url"),
    // Legacy AI-detection score columns. Preserved through the rebuild so
    // existing data isn't lost; UI no longer reads them. Dropped in a later
    // cleanup migration.
    humanScore: integer("human_score"),
    passesAiDetection: integer("passes_ai_detection"),
    // Foundations Plan 4 Task 4: true when the article body was produced by
    // the content-generation worker. Manually-created articles (POST
    // /api/articles) stay false. Powers the "AI-generated" disclosure pill.
    aiGenerated: boolean("ai_generated").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    seoData: jsonb("seo_data"),
  },
  (table) => [
    index("articles_brand_id_idx").on(table.brandId),
    index("articles_status_idx").on(table.status),
    index("articles_job_id_idx").on(table.jobId),
  ],
);

// Per-revision history for Auto-Improve and manual edits. Each row is an
// immutable snapshot of `articles.content` at the moment the revision was
// created. The diff viewer renders newest-vs-current; restore copies an old
// revision's content back onto the article and logs a `manual_edit` row to
// record the restore point.
export const articleRevisions = pgTable(
  "article_revisions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    articleId: varchar("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // 'generated' | 'manual_edit' | 'auto_improve' | 'distribute_back'
    source: text("source").notNull(),
    createdBy: varchar("created_by"), // userId, or 'system' for worker writes
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("article_revisions_article_idx").on(table.articleId, table.createdAt)],
);

export type ArticleRevision = typeof articleRevisions.$inferSelect;
export type InsertArticleRevision = typeof articleRevisions.$inferInsert;

export const distributions = pgTable(
  "distributions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    articleId: varchar("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    platformPostId: text("platform_post_id"),
    platformUrl: text("platform_url"),
    status: text("status").notNull().default("pending"),
    distributedAt: timestamp("distributed_at"),
    error: text("error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("distributions_article_id_idx").on(table.articleId)],
);

export const keywordResearch = pgTable(
  "keyword_research",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    searchVolume: integer("search_volume"),
    difficulty: integer("difficulty"),
    opportunityScore: integer("opportunity_score").default(50).notNull(),
    aiCitationPotential: integer("ai_citation_potential").default(50).notNull(),
    intent: text("intent").default("informational"),
    category: text("category"),
    competitorGap: integer("competitor_gap").default(0).notNull(),
    suggestedContentType: text("suggested_content_type").default("article"),
    relatedKeywords: text("related_keywords").array(),
    status: text("status").default("discovered").notNull(),
    provenance: text("provenance").default("ai-estimate").notNull(),
    contentGenerated: integer("content_generated").default(0).notNull(),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("keyword_research_brand_id_idx").on(table.brandId)],
);

export const insertKeywordResearchSchema = createInsertSchema(keywordResearch).omit({
  id: true,
  discoveredAt: true,
  updatedAt: true,
});
export type KeywordResearch = typeof keywordResearch.$inferSelect;
export type InsertKeywordResearch = z.infer<typeof insertKeywordResearchSchema>;

// Background job queue for content generation so long-running GPT calls
// survive page navigation, logout, and browser refresh. Polled in-process
// by server/contentGenerationWorker.ts — no Redis/BullMQ dependency.
export const contentGenerationJobs = pgTable(
  "content_generation_jobs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    // 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    status: text("status").notNull().default("pending"),
    requestPayload: jsonb("request_payload").notNull(),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    errorMessage: text("error_message"),
    // Wave 7: refund + legacy streaming support.
    // streamBuffer was the token accumulation column for the prior
    // Chat-Completions streaming worker. Vercel migration (Wave 9.5)
    // replaced that with the OpenAI Responses API in background mode,
    // which doesn't write here. The column is preserved so the slice
    // runner can detect "legacy in-flight" jobs (streamBuffer populated,
    // openaiResponseId NULL) and fail them cleanly so users retry.
    // errorKind classifies failures so refundArticleQuota knows whether
    // to refund (transient infra) or not (user error / budget).
    // refundedAt is set once the refund is applied (idempotent).
    streamBuffer: text("stream_buffer").default(""),
    errorKind: text("error_kind"), // 'budget'|'circuit'|'openai_5xx'|'openai_429'|'timeout'|'invalid_input'|'unknown'
    refundedAt: timestamp("refunded_at"),
    // Vercel migration: per-call slice lock. /advance updates this when
    // it claims the job for an 8s slice; concurrent advance calls bail.
    lastAdvanceStartedAt: timestamp("last_advance_started_at"),
    // Vercel migration: ID of the OpenAI Responses run executing this
    // job. Set by the first /advance call; subsequent calls poll
    // openai.responses.retrieve(openaiResponseId). Null on legacy jobs
    // and on jobs not yet started.
    openaiResponseId: text("openai_response_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("content_gen_jobs_user_status_idx").on(table.userId, table.status),
    index("content_gen_jobs_status_idx").on(table.status),
  ],
);

export const insertContentGenerationJobSchema = createInsertSchema(contentGenerationJobs).omit({
  id: true,
  createdAt: true,
});
export type ContentGenerationJob = typeof contentGenerationJobs.$inferSelect;
export type InsertContentGenerationJob = z.infer<typeof insertContentGenerationJobSchema>;

// Wave 7: the legacy content_drafts table was absorbed into `articles` (with
// status='draft'). See migration 0033_content_unification.sql.

// Tracks each batch of 10 prompts generated for a brand. Enables prompt
// versioning so users can see which prompts were used in historical runs.
export const promptGenerations = pgTable(
  "prompt_generations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    generationNumber: integer("generation_number").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("prompt_generations_brand_id_idx").on(table.brandId)],
);

export const insertPromptGenerationSchema = createInsertSchema(promptGenerations).omit({
  id: true,
  createdAt: true,
});
export type PromptGeneration = typeof promptGenerations.$inferSelect;
export type InsertPromptGeneration = z.infer<typeof insertPromptGenerationSchema>;

export const brandPrompts = pgTable(
  "brand_prompts",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    generationId: varchar("generation_id").references(() => promptGenerations.id, {
      onDelete: "set null",
    }),
    prompt: text("prompt").notNull(),
    rationale: text("rationale"),
    orderIndex: integer("order_index").default(0).notNull(),
    isActive: integer("is_active").default(1).notNull(), // legacy — use `status` instead
    status: text("status").default("tracked").notNull(), // "tracked" | "suggested" | "archived"
    // Richer classification promoted from the deprecated prompt_portfolio
    // table so every tracked prompt carries funnel + category dimensions.
    category: text("category"),
    funnelStage: text("funnel_stage"), // "TOFU" | "MOFU" | "BOFU"
    region: text("region").default("global").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("brand_prompts_brand_id_idx").on(table.brandId),
    index("brand_prompts_generation_id_idx").on(table.generationId),
  ],
);

export const insertBrandPromptSchema = createInsertSchema(brandPrompts).omit({
  id: true,
  createdAt: true,
});
export type BrandPrompt = typeof brandPrompts.$inferSelect;
export type InsertBrandPrompt = z.infer<typeof insertBrandPromptSchema>;

// Per-brand AI Visibility Checklist progress. One row per completed step so
// toggling is a simple insert/delete instead of a JSON read-modify-write.
export const visibilityProgress = pgTable(
  "visibility_progress",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    engineId: text("engine_id").notNull(),
    stepId: text("step_id").notNull(),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [
    index("visibility_progress_brand_id_idx").on(table.brandId),
    uniqueIndex("visibility_progress_brand_engine_step_idx").on(
      table.brandId,
      table.engineId,
      table.stepId,
    ),
  ],
);

export const insertVisibilityProgressSchema = createInsertSchema(visibilityProgress).omit({
  id: true,
  completedAt: true,
});
export type VisibilityProgress = typeof visibilityProgress.$inferSelect;
export type InsertVisibilityProgress = z.infer<typeof insertVisibilityProgressSchema>;

// One row per "Analyze GEO Signals" run. Powers `lastSignalsScanAt`
// input on the recommendations engine so rule #8 stops firing on
// brands that have actually scanned.
export const geoSignalRuns = pgTable(
  "geo_signal_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: varchar("article_id").references(() => articles.id, {
      onDelete: "set null",
    }),
    ranAt: timestamp("ran_at").defaultNow().notNull(),
    overallScore: integer("overall_score"),
    payload: jsonb("payload"),
  },
  (table) => [index("geo_signal_runs_brand_id_ran_at_idx").on(table.brandId, table.ranAt.desc())],
);

export const insertGeoSignalRunSchema = createInsertSchema(geoSignalRuns).omit({
  id: true,
  ranAt: true,
});
export type GeoSignalRun = typeof geoSignalRuns.$inferSelect;
export type InsertGeoSignalRun = z.infer<typeof insertGeoSignalRunSchema>;

// ============================================================================
// Spec 2: Brand Fact Sheet redesign — scrape runs + pages + cost caps
// ============================================================================

// One row per scrape run. Slice-resumable via `status='slice_pending'`.
// Read by the SSE stream + the new diff view. See spec 2 §5.2.
export const brandFactScrapeRuns = pgTable(
  "brand_fact_scrape_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    triggeredBy: text("triggered_by").notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    lastAdvanceAt: timestamp("last_advance_at").notNull().defaultNow(),
    deadlineMs: bigint("deadline_ms", { mode: "number" }),
    pagesPlanned: integer("pages_planned").notNull().default(0),
    pagesFetched: integer("pages_fetched").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    factsExtracted: integer("facts_extracted").notNull().default(0),
    factsValidated: integer("facts_validated").notNull().default(0),
    factsRedacted: integer("facts_redacted").notNull().default(0),
    llmCostCents: integer("llm_cost_cents").notNull().default(0),
    llmCalls: integer("llm_calls").notNull().default(0),
    llmInputTokens: bigint("llm_input_tokens", { mode: "number" }).notNull().default(0),
    llmOutputTokens: bigint("llm_output_tokens", { mode: "number" }).notNull().default(0),
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),
    plan: jsonb("plan"),
    progress: jsonb("progress"),
    diagnostics: jsonb("diagnostics"),
    retryCount: integer("retry_count").notNull().default(0),
  },
  (table) => [
    index("brand_fact_scrape_runs_brand_started_idx").on(table.brandId, table.startedAt.desc()),
    index("brand_fact_scrape_runs_slice_pending_idx").on(table.lastAdvanceAt),
    // Spec 2 §4.9: at most one active run per brand. Partial unique index
    // mirrors migrations/0061_brand_fact_scrape_runs_uniq_active.sql.
    uniqueIndex("brand_fact_scrape_runs_one_active_per_brand_idx")
      .on(table.brandId)
      .where(sql`status IN ('pending','planning','fetching','extracting','slice_pending')`),
  ],
);

export const insertBrandFactScrapeRunSchema = createInsertSchema(brandFactScrapeRuns).omit({
  id: true,
  startedAt: true,
  lastAdvanceAt: true,
});
export type BrandFactScrapeRun = typeof brandFactScrapeRuns.$inferSelect;
export type InsertBrandFactScrapeRun = z.infer<typeof insertBrandFactScrapeRunSchema>;

// One row per page the agent attempted in a run. Drives the per-page UI panel.
export const brandFactScrapePages = pgTable(
  "brand_fact_scrape_pages",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: varchar("run_id")
      .notNull()
      .references(() => brandFactScrapeRuns.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    status: text("status").notNull().default("pending"),
    fetchedAt: timestamp("fetched_at"),
    bytes: integer("bytes"),
    statusCode: integer("status_code"),
    contentType: text("content_type"),
    lang: text("lang"),
    factCount: integer("fact_count").notNull().default(0),
    llmCostCents: integer("llm_cost_cents").notNull().default(0),
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),
    excerpt: text("excerpt"),
  },
  (table) => [index("brand_fact_scrape_pages_run_idx").on(table.runId)],
);

export const insertBrandFactScrapePageSchema = createInsertSchema(brandFactScrapePages).omit({
  id: true,
});
export type BrandFactScrapePage = typeof brandFactScrapePages.$inferSelect;
export type InsertBrandFactScrapePage = z.infer<typeof insertBrandFactScrapePageSchema>;

// Per-brand monthly LLM cost cap. Row created lazily on first scrape of month.
export const brandMonthlyCostCaps = pgTable(
  "brand_monthly_cost_caps",
  {
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    monthKey: text("month_key").notNull(),
    factScrapeCents: integer("fact_scrape_cents").notNull().default(0),
    monthlyCapCents: integer("monthly_cap_cents").notNull().default(500),
  },
  (table) => [
    primaryKey({ columns: [table.brandId, table.monthKey] }),
    index("brand_monthly_cost_caps_month_idx").on(table.monthKey),
  ],
);

export const insertBrandMonthlyCostCapSchema = createInsertSchema(brandMonthlyCostCaps);
export type BrandMonthlyCostCap = typeof brandMonthlyCostCaps.$inferSelect;
export type InsertBrandMonthlyCostCap = z.infer<typeof insertBrandMonthlyCostCapSchema>;

// One row per "Run Citation Check" click or weekly cron run. Stores the
// aggregate totals so the trend chart can render without re-aggregating
// every geo_rankings row.
export const citationRuns = pgTable(
  "citation_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    totalChecks: integer("total_checks").default(0).notNull(),
    totalCited: integer("total_cited").default(0).notNull(),
    citationRate: integer("citation_rate").default(0).notNull(),
    triggeredBy: text("triggered_by").notNull().default("manual"), // manual | cron
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    // Per-platform breakdown snapshot so the history endpoint doesn't
    // need to re-join geo_rankings for every run.
    platformBreakdown: jsonb("platform_breakdown"),
    // Wave 8: explicit lifecycle. Drives the "is any run active for this
    // brand" status gate that the live-update hooks read on every page.
    // 'pending'|'running'|'succeeded'|'failed'|'partial'|'cancelled'.
    status: text("status").default("succeeded").notNull(),
    progressPct: integer("progress_pct").default(100).notNull(),
    errorMessage: text("error_message"),
    // Wave 9: number of (matcher, analyzer) disagreements during the run.
    // Surfaced on HistoryTab as a tooltip so users can spot brands whose
    // nameVariations list needs tuning.
    disagreementCount: integer("disagreement_count").default(0).notNull(),
    // Wave 9.4: number of times an LLM response in this run cited a URL
    // registered in tracked_content_urls (i.e. the brand's own published
    // BOFU/FAQ pages). Surfaces "did the content I generated work?".
    selfCitationCount: integer("self_citation_count").default(0).notNull(),
  },
  (table) => [
    index("citation_runs_brand_id_idx").on(table.brandId),
    index("citation_runs_started_at_idx").on(table.startedAt),
  ],
);

export const insertCitationRunSchema = createInsertSchema(citationRuns).omit({
  id: true,
  startedAt: true,
});
export type CitationRun = typeof citationRuns.$inferSelect;
export type InsertCitationRun = z.infer<typeof insertCitationRunSchema>;

export const geoRankings = pgTable(
  "geo_rankings",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }),
    brandPromptId: varchar("brand_prompt_id").references(() => brandPrompts.id, {
      onDelete: "set null",
    }),
    runId: varchar("run_id").references(() => citationRuns.id, { onDelete: "set null" }),
    aiPlatform: text("ai_platform").notNull(),
    prompt: text("prompt").notNull(),
    rank: integer("rank"),
    isCited: integer("is_cited").default(0).notNull(),
    citationContext: text("citation_context"),
    citingOutletUrl: text("citing_outlet_url"),
    citingOutletName: text("citing_outlet_name"),
    // Phase 3: list of all URLs the LLM cited in its response
    // (vs. citingOutletUrl which is the single matcher-derived URL).
    // Set by citationChecker via extractCitedUrls(responseText). Capped
    // at 20 entries application-side. Existing rows stay null.
    citedUrls: text("cited_urls").array(),
    sentiment: text("sentiment").default("neutral"),
    sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }).default("0"),
    // Richer quality signals promoted from deprecated citation_quality table.
    // source_type: community/reference/video/web based on citingOutletUrl domain.
    // authority_score: 0-100, derived at write time from domain occurrence history.
    // relevance_score: 0-100, returned by the citation judge LLM call (null if judge not invoked).
    sourceType: text("source_type"),
    authorityScore: integer("authority_score"),
    relevanceScore: integer("relevance_score"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
    // Set by the "Re-check stored" flow when updated name variations
    // newly reveal a citation that the original run missed. Rank stays
    // null on these rows since the LLM rank pass didn't see them as cited.
    reDetectedAt: timestamp("re_detected_at"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("geo_rankings_article_id_idx").on(table.articleId),
    index("geo_rankings_brand_prompt_id_idx").on(table.brandPromptId),
    index("geo_rankings_run_id_idx").on(table.runId),
    index("geo_rankings_ai_platform_idx").on(table.aiPlatform),
  ],
);

export const brandVisibilitySnapshots = pgTable(
  "brand_visibility_snapshots",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    mentionCount: integer("mention_count").default(0).notNull(),
    citationCount: integer("citation_count").default(0).notNull(),
    shareOfVoice: numeric("share_of_voice", { precision: 5, scale: 2 }).default("0"),
    visibilityScore: integer("visibility_score").default(0).notNull(),
    sentimentPositive: integer("sentiment_positive").default(0).notNull(),
    sentimentNeutral: integer("sentiment_neutral").default(0).notNull(),
    sentimentNegative: integer("sentiment_negative").default(0).notNull(),
    avgSentimentScore: numeric("avg_sentiment_score", { precision: 3, scale: 2 }).default("0"),
    snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("brand_visibility_snapshots_brand_id_idx").on(table.brandId)],
);

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCitationSchema = createInsertSchema(citations).omit({
  id: true,
  timestamp: true,
});

export const insertAnalyticsSchema = createInsertSchema(analytics).omit({
  id: true,
  updatedAt: true,
});

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  citationCount: true,
});

export const insertDistributionSchema = createInsertSchema(distributions).omit({
  id: true,
  createdAt: true,
});

export const insertGeoRankingSchema = createInsertSchema(geoRankings).omit({
  id: true,
});

export const insertBrandSchema = createInsertSchema(brands).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const competitors = pgTable(
  "competitors",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    industry: text("industry"),
    description: text("description"),
    // Shares semantics with brands.nameVariations: extra surface forms
    // the detection matcher should treat as equivalent. LLM-extracted
    // surface forms get auto-appended; users can edit in the UI.
    nameVariations: text("name_variations")
      .array()
      .default(sql`ARRAY[]::text[]`),
    discoveredBy: text("discovered_by").default("manual").notNull(), // "manual" | "ai" | "citation_mining" | "scheduler"
    // Soft delete + ignore tombstone. `deletedAt` hides from lists;
    // `isIgnored=1` additionally blocks re-discovery in cron.
    deletedAt: timestamp("deleted_at"),
    isIgnored: integer("is_ignored").default(0).notNull(),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("competitors_brand_id_idx").on(table.brandId),
    // Unique index is maintained via migration 0026 using lower(name) +
    // lower(coalesce(domain,'')); Drizzle cannot express the expression here.
  ],
);

// Per-run, per-prompt competitor citation detail. Mirrors geo_rankings so
// competitors are tracked with the same fidelity as the brand — one row
// per (competitor × run × prompt × platform), containing whether the
// competitor was cited, its rank, relevance, and a snippet of the
// mentioning response. Powers the competitor leaderboard, drill-downs
// ("which prompts cited HubSpot on Claude?"), and share-of-voice.
export const competitorGeoRankings = pgTable(
  "competitor_geo_rankings",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    competitorId: varchar("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    runId: varchar("run_id").notNull(),
    brandPromptId: varchar("brand_prompt_id").notNull(),
    aiPlatform: text("ai_platform").notNull(),
    isCited: integer("is_cited").default(0).notNull(),
    rank: integer("rank"),
    relevanceScore: integer("relevance_score"),
    citationContext: text("citation_context"),
    citingOutletUrl: text("citing_outlet_url"),
    sentiment: text("sentiment"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (table) => [
    index("cgr_competitor_idx").on(table.competitorId),
    index("cgr_run_idx").on(table.runId),
    index("cgr_brand_prompt_idx").on(table.brandPromptId),
  ],
);

export const competitorCitationSnapshots = pgTable(
  "competitor_citation_snapshots",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    competitorId: varchar("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    citationCount: integer("citation_count").default(0).notNull(),
    snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
    // Correlates a snapshot row to the citation run that produced it.
    // Null for legacy rows. Unique (competitor_id, ai_platform, run_id)
    // enforced via migration 0026 (partial index where run_id IS NOT NULL).
    runId: varchar("run_id"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("competitor_citation_snapshots_competitor_id_idx").on(table.competitorId),
    index("cc_snapshots_run_id_idx").on(table.runId),
  ],
);

export const insertCompetitorSchema = createInsertSchema(competitors).omit({
  id: true,
  createdAt: true,
});

export const insertCompetitorCitationSnapshotSchema = createInsertSchema(
  competitorCitationSnapshots,
).omit({
  id: true,
  snapshotDate: true,
});

export const insertCompetitorGeoRankingSchema = createInsertSchema(competitorGeoRankings).omit({
  id: true,
  checkedAt: true,
});

export const insertBrandVisibilitySnapshotSchema = createInsertSchema(
  brandVisibilitySnapshots,
).omit({
  id: true,
  snapshotDate: true,
});

// Listicle tracking - monitor "best of" articles for brand inclusion
export const listicles = pgTable(
  "listicles",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    sourcePublication: text("source_publication"),
    listPosition: integer("list_position"),
    totalListItems: integer("total_list_items"),
    isIncluded: integer("is_included").default(0).notNull(),
    competitorsMentioned: text("competitors_mentioned").array(),
    keyword: text("keyword"),
    searchVolume: integer("search_volume"),
    domainAuthority: integer("domain_authority"),
    lastChecked: timestamp("last_checked").defaultNow().notNull(),
    // Wave 9.4: outreach lifecycle. Values: 'new' | 'contacted' | 'won' | 'dropped'.
    outreachStatus: text("outreach_status").default("new").notNull(),
    outreachNotes: text("outreach_notes"),
    // Wave 9.4: refresh on subsequent scans so isIncluded/listPosition can
    // be re-validated rather than frozen at first-discovery time.
    lastVerifiedAt: timestamp("last_verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("listicles_brand_id_idx").on(table.brandId)],
);

// Wikipedia presence monitoring
export const wikipediaMentions = pgTable(
  "wikipedia_mentions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    pageTitle: text("page_title").notNull(),
    pageUrl: text("page_url").notNull(),
    mentionContext: text("mention_context"),
    mentionType: text("mention_type"), // 'direct', 'reference', 'citation', 'related'
    sectionName: text("section_name"),
    isActive: integer("is_active").default(1).notNull(),
    lastVerified: timestamp("last_verified").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("wikipedia_mentions_brand_id_idx").on(table.brandId)],
);

// BOFU content templates and generated content
export const bofuContent = pgTable(
  "bofu_content",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    primaryKeyword: text("primary_keyword"),
    comparedWith: text("compared_with").array(),
    targetIntent: text("target_intent"),
    status: text("status").default("draft"),
    aiScore: integer("ai_score"),
    // Wave 9.4: content lifecycle. publishedUrl is the canonical URL
    // where this BOFU piece lives; once set, the citation checker tracks
    // self-citations against it and updates lastCitedAt.
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at"),
    lastCitedAt: timestamp("last_cited_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("bofu_content_brand_id_idx").on(table.brandId)],
);

// FAQ optimization tracking
export const faqItems = pgTable(
  "faq_items",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: text("category"),
    searchVolume: integer("search_volume"),
    aiSurfaceScore: integer("ai_surface_score"),
    isOptimized: integer("is_optimized").default(0).notNull(),
    optimizationTips: text("optimization_tips").array(),
    // Wave 9.4: lifecycle parallel to bofu_content.
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at"),
    lastCitedAt: timestamp("last_cited_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("faq_items_brand_id_idx").on(table.brandId)],
);

// Brand mention tracking across platforms
export const brandMentions = pgTable(
  "brand_mentions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title"),
    mentionContext: text("mention_context"),
    sentiment: text("sentiment").default("neutral"),
    sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }).default("0"),
    engagementScore: integer("engagement_score"),
    authorUsername: text("author_username"),
    isVerified: integer("is_verified").default(0).notNull(),
    // Wave 9.4: explicit lifecycle. Values:
    //   'new' | 'acknowledged' | 'replied' | 'false_positive' | 'ignored'.
    status: text("status").default("new").notNull(),
    mentionedAt: timestamp("mentioned_at"),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
    // Mentions rebuild (0050): new columns for precise brand-mention monitor.
    mentionLocation: text("mention_location").default("post"),
    linkStatus: text("link_status").default("unknown"),
    lastVerifiedAt: timestamp("last_verified_at"),
    matchedVariation: text("matched_variation"),
    matchedField: text("matched_field"),
    source: text("source").default("scanner"),
    scannerVersion: integer("scanner_version").default(2),
    sentimentSource: text("sentiment_source").default("llm"),
    engagementNormalized: integer("engagement_normalized"),
  },
  (table) => [index("brand_mentions_brand_id_idx").on(table.brandId)],
);

// Wave 9.4: registry of brand-owned published URLs (currently from
// bofu_content + faq_items via a polymorphic source_type/source_id pair)
// that the citation checker matches against. When the LLM in a citation
// run cites one of these URLs, the corresponding bofu_content / faq_items
// row gets last_cited_at = now() and citation_runs.self_citation_count
// increments.
export const trackedContentUrls = pgTable(
  "tracked_content_urls",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(), // 'bofu' | 'faq'
    sourceId: varchar("source_id").notNull(),
    url: text("url").notNull(),
    // Lower-cased host + path with www./trailing-slash/query/fragment
    // stripped. The matcher works against this normalized form so URL
    // variations match consistently.
    normalizedUrl: text("normalized_url").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tracked_content_urls_brand_id_idx").on(table.brandId),
    index("tracked_content_urls_brand_id_normalized_url_idx").on(
      table.brandId,
      table.normalizedUrl,
    ),
  ],
);

export const insertListicleSchema = createInsertSchema(listicles).omit({
  id: true,
  createdAt: true,
  lastChecked: true,
});

export const insertWikipediaMentionSchema = createInsertSchema(wikipediaMentions).omit({
  id: true,
  createdAt: true,
  lastVerified: true,
});

export const insertBofuContentSchema = createInsertSchema(bofuContent).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFaqItemSchema = createInsertSchema(faqItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBrandMentionSchema = createInsertSchema(brandMentions).omit({
  id: true,
  discoveredAt: true,
});

export const insertTrackedContentUrlSchema = createInsertSchema(trackedContentUrls).omit({
  id: true,
  createdAt: true,
});

// Prompt Portfolio - Track prompts by category/intent with share-of-answer
export const promptPortfolio = pgTable(
  "prompt_portfolio",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    category: text("category").notNull(),
    funnelStage: text("funnel_stage").notNull(),
    competitorSet: text("competitor_set").array(),
    region: text("region").default("global"),
    aiPlatform: text("ai_platform").notNull(),
    isBrandCited: integer("is_brand_cited").default(0).notNull(),
    citationPosition: integer("citation_position"),
    shareOfAnswer: numeric("share_of_answer", { precision: 5, scale: 2 }).default("0"),
    sentiment: text("sentiment").default("neutral"),
    answerVolatility: integer("answer_volatility").default(0),
    consensusScore: integer("consensus_score").default(0),
    lastChecked: timestamp("last_checked").defaultNow().notNull(),
    checkedHistory: jsonb("checked_history"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("prompt_portfolio_brand_id_idx").on(table.brandId)],
);

// Citation Quality Scoring
export const citationQuality = pgTable(
  "citation_quality",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    aiPlatform: text("ai_platform").notNull(),
    prompt: text("prompt"),
    citationUrl: text("citation_url"),
    authorityScore: integer("authority_score").default(0).notNull(),
    relevanceScore: integer("relevance_score").default(0).notNull(),
    recencyScore: integer("recency_score").default(0).notNull(),
    positionScore: integer("position_score").default(0).notNull(),
    isPrimaryCitation: integer("is_primary_citation").default(0).notNull(),
    totalQualityScore: integer("total_quality_score").default(0).notNull(),
    sourceType: text("source_type"),
    competingCitations: text("competing_citations").array(),
    scoredAt: timestamp("scored_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("citation_quality_brand_id_idx").on(table.brandId)],
);

// Hallucination Detection - Track inaccurate AI claims
export const brandHallucinations = pgTable(
  "brand_hallucinations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    prompt: text("prompt").notNull(),
    claimedStatement: text("claimed_statement").notNull(),
    actualFact: text("actual_fact"),
    hallucinationType: text("hallucination_type").notNull(),
    severity: text("severity").notNull().default("medium"), // 'low' | 'medium' | 'high' | 'critical' (CHECK in 0026)
    category: text("category"),
    isResolved: integer("is_resolved").default(0).notNull(),
    remediationSteps: text("remediation_steps").array(),
    remediationStatus: text("remediation_status").default("pending"), // 'pending' | 'in_progress' | 'resolved' | 'dismissed' | 'verified'
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    verifiedBy: text("verified_by"),
    // Source traceback: copied from the originating geo_ranking at detect time.
    rankingId: varchar("ranking_id"),
    citingOutletUrl: text("citing_outlet_url"),
    citationContext: text("citation_context"),
    articleTitle: text("article_title"),
    // Bumped on ON CONFLICT dedup so we can show "seen 12 times".
    lastSeenAt: timestamp("last_seen_at"),
    seenCount: integer("seen_count").default(1).notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("brand_hallucinations_brand_id_idx").on(table.brandId),
    index("brand_hallucinations_ranking_id_idx").on(table.rankingId),
  ],
);

// Brand Fact Sheet - Source of truth for hallucination checking
export const brandFactSheet = pgTable(
  "brand_fact_sheet",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    // Spec 2 §4.3: 8 universal domains
    domain: text("domain").notNull().default("identity"),
    // Spec 2 §4.3: free-form LLM-picked subcategory (was `factCategory`)
    subcategory: text("subcategory").notNull(),
    factKey: text("fact_key").notNull(),
    factValue: text("fact_value").notNull(),
    // Spec 2 §4.4: valueType discriminated union
    valueType: text("value_type").notNull().default("string"),
    valuePayload: jsonb("value_payload"),
    // Spec 2 §4.8: quality signal from agent extraction
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    // Spec 2 §4.6: 200-char snippet showing where the fact came from
    sourceExcerpt: text("source_excerpt"),
    sourceUrl: text("source_url"),
    source: text("source").notNull().default("manual"),
    // Spec 2 §4.6: diff resolution state
    dismissedAt: timestamp("dismissed_at"),
    acceptedAt: timestamp("accepted_at"),
    // Spec 2 §4.1: FK to the run that produced this row (null for source='user'/'manual')
    runId: varchar("run_id").references(() => brandFactScrapeRuns.id, { onDelete: "set null" }),
    lastVerified: timestamp("last_verified").notNull().defaultNow(),
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    metadata: jsonb("metadata"),
    disagreementCount: integer("disagreement_count").notNull().default(0),
    schemaVersion: integer("schema_version").notNull().default(1),
  },
  (table) => [index("brand_fact_sheet_brand_id_idx").on(table.brandId)],
);

// Metrics History - Track metrics snapshots over time for trend analysis
export const metricsHistory = pgTable(
  "metrics_history",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    metricType: text("metric_type").notNull(),
    metricValue: numeric("metric_value", { precision: 10, scale: 2 }).notNull(),
    metricDetails: jsonb("metric_details"),
    snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
  },
  (table) => [index("metrics_history_brand_id_idx").on(table.brandId)],
);

// Alert Settings - Configure notifications for metric changes
export const alertSettings = pgTable(
  "alert_settings",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    alertType: text("alert_type").notNull(),
    isEnabled: integer("is_enabled").default(1).notNull(),
    threshold: numeric("threshold", { precision: 10, scale: 2 }),
    emailEnabled: integer("email_enabled").default(0).notNull(),
    emailAddress: text("email_address"),
    slackEnabled: integer("slack_enabled").default(0).notNull(),
    slackWebhookUrl: text("slack_webhook_url"),
    lastTriggered: timestamp("last_triggered"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("alert_settings_brand_id_idx").on(table.brandId)],
);

// Alert History - Track sent alerts
export const alertHistory = pgTable(
  "alert_history",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    alertSettingId: varchar("alert_setting_id").references(() => alertSettings.id, {
      onDelete: "cascade",
    }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    alertType: text("alert_type").notNull(),
    message: text("message").notNull(),
    details: jsonb("details"),
    sentVia: text("sent_via").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [index("alert_history_brand_id_idx").on(table.brandId)],
);

// Prompt Test Runs - Scheduled testing of prompts across AI platforms
export const promptTestRuns = pgTable(
  "prompt_test_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    promptPortfolioId: varchar("prompt_portfolio_id").references(() => promptPortfolio.id, {
      onDelete: "set null",
    }),
    prompt: text("prompt").notNull(),
    aiPlatform: text("ai_platform").notNull(),
    response: text("response"),
    isBrandCited: integer("is_brand_cited").default(0).notNull(),
    citationPosition: integer("citation_position"),
    competitorsFound: text("competitors_found").array(),
    sentiment: text("sentiment").default("neutral"),
    shareOfAnswer: numeric("share_of_answer", { precision: 5, scale: 2 }),
    hallucinationDetected: integer("hallucination_detected").default(0).notNull(),
    hallucinationDetails: text("hallucination_details"),
    sourcesCited: jsonb("sources_cited"),
    runStatus: text("run_status").notNull().default("pending"),
    scheduledAt: timestamp("scheduled_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    error: text("error"),
    metadata: jsonb("metadata"),
  },
  (table) => [index("prompt_test_runs_brand_id_idx").on(table.brandId)],
);

// Agent Tasks - Queue for automated GEO optimization tasks
export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(),
    taskTitle: text("task_title").notNull(),
    taskDescription: text("task_description"),
    priority: text("priority").notNull().default("medium"), // 'low', 'medium', 'high', 'urgent'
    status: text("status").notNull().default("queued"), // 'queued', 'in_progress', 'completed', 'failed', 'cancelled'
    assignedTo: text("assigned_to").default("agent"), // 'agent' for automated, or user ID for manual
    triggeredBy: text("triggered_by").notNull(), // 'manual', 'cron', 'chained'
    inputData: jsonb("input_data"), // Task-specific input parameters
    outputData: jsonb("output_data"), // Task results/outputs
    aiModelUsed: text("ai_model_used"),
    tokensUsed: integer("tokens_used").default(0).notNull(),
    estimatedCredits: numeric("estimated_credits", { precision: 10, scale: 4 }),
    actualCredits: numeric("actual_credits", { precision: 10, scale: 4 }),
    scheduledFor: timestamp("scheduled_for"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    error: text("error"),
    retryCount: integer("retry_count").default(0).notNull(),
    maxRetries: integer("max_retries").default(3).notNull(),
    // Artifact link: set after the executor creates a downstream object so
    // the task row points to its result. Currently the only live writer is
    // the prompt_test handler, which sets artifactType = 'citation_run'.
    // CHECK constraint tightened to that single value in migration 0071.
    artifactType: text("artifact_type"),
    artifactId: varchar("artifact_id"),
    workflowRunId: varchar("workflow_run_id"),
    workflowStepKey: text("workflow_step_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("agent_tasks_brand_id_idx").on(table.brandId),
    index("agent_tasks_status_idx").on(table.status),
    index("agent_tasks_artifact_idx").on(table.artifactType, table.artifactId),
    index("agent_tasks_workflow_run_idx").on(table.workflowRunId),
  ],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    workflowKey: text("workflow_key").notNull(),
    status: text("status").notNull().default("pending"),
    currentStepIndex: integer("current_step_index").default(0).notNull(),
    stepStates: jsonb("step_states")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    input: jsonb("input"),
    lastError: text("last_error"),
    triggeredBy: text("triggered_by").notNull().default("manual"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("workflow_runs_brand_status_idx").on(table.brandId, table.status),
    index("workflow_runs_user_idx").on(table.userId),
  ],
);

export const insertAlertSettingsSchema = createInsertSchema(alertSettings).omit({
  id: true,
  createdAt: true,
  lastTriggered: true,
});

export const insertAlertHistorySchema = createInsertSchema(alertHistory).omit({
  id: true,
  sentAt: true,
});

export const insertPromptTestRunSchema = createInsertSchema(promptTestRuns).omit({
  id: true,
  createdAt: true,
});

export const insertAgentTaskSchema = createInsertSchema(agentTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkflowRunSchema = createInsertSchema(workflowRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertMetricsHistorySchema = createInsertSchema(metricsHistory).omit({
  id: true,
  snapshotDate: true,
});

export const insertPromptPortfolioSchema = createInsertSchema(promptPortfolio).omit({
  id: true,
  createdAt: true,
  lastChecked: true,
});

export const insertCitationQualitySchema = createInsertSchema(citationQuality).omit({
  id: true,
  scoredAt: true,
});

export const insertBrandHallucinationSchema = createInsertSchema(brandHallucinations).omit({
  id: true,
  detectedAt: true,
});

export const insertBrandFactSheetSchema = createInsertSchema(brandFactSheet).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastVerified: true,
  acceptedAt: true,
  dismissedAt: true,
});

export type InsertCitation = z.infer<typeof insertCitationSchema>;
export type Citation = typeof citations.$inferSelect;
export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;
export type Analytics = typeof analytics.$inferSelect;
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articles.$inferSelect;
export type InsertDistribution = z.infer<typeof insertDistributionSchema>;
export type Distribution = typeof distributions.$inferSelect;
export type InsertGeoRanking = z.infer<typeof insertGeoRankingSchema>;
export type GeoRanking = typeof geoRankings.$inferSelect;
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Brand = typeof brands.$inferSelect;
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = typeof competitors.$inferSelect;
export type InsertCompetitorCitationSnapshot = z.infer<
  typeof insertCompetitorCitationSnapshotSchema
>;
export type CompetitorCitationSnapshot = typeof competitorCitationSnapshots.$inferSelect;
export type InsertCompetitorGeoRanking = z.infer<typeof insertCompetitorGeoRankingSchema>;
export type CompetitorGeoRanking = typeof competitorGeoRankings.$inferSelect;
export type InsertBrandVisibilitySnapshot = z.infer<typeof insertBrandVisibilitySnapshotSchema>;
export type BrandVisibilitySnapshot = typeof brandVisibilitySnapshots.$inferSelect;
export type InsertListicle = z.infer<typeof insertListicleSchema>;
export type Listicle = typeof listicles.$inferSelect;
export type InsertTrackedContentUrl = z.infer<typeof insertTrackedContentUrlSchema>;
export type TrackedContentUrl = typeof trackedContentUrls.$inferSelect;
export type InsertWikipediaMention = z.infer<typeof insertWikipediaMentionSchema>;
export type WikipediaMention = typeof wikipediaMentions.$inferSelect;
export type InsertBofuContent = z.infer<typeof insertBofuContentSchema>;
export type BofuContent = typeof bofuContent.$inferSelect;
export type InsertFaqItem = z.infer<typeof insertFaqItemSchema>;
export type FaqItem = typeof faqItems.$inferSelect;
export type InsertBrandMention = z.infer<typeof insertBrandMentionSchema>;
export type BrandMention = typeof brandMentions.$inferSelect;
export type InsertPromptPortfolio = z.infer<typeof insertPromptPortfolioSchema>;
export type PromptPortfolio = typeof promptPortfolio.$inferSelect;
export type InsertCitationQuality = z.infer<typeof insertCitationQualitySchema>;
export type CitationQuality = typeof citationQuality.$inferSelect;
export type InsertBrandHallucination = z.infer<typeof insertBrandHallucinationSchema>;
export type BrandHallucination = typeof brandHallucinations.$inferSelect;
export type InsertBrandFactSheet = z.infer<typeof insertBrandFactSheetSchema>;
export type BrandFactSheet = typeof brandFactSheet.$inferSelect;
export type InsertMetricsHistory = z.infer<typeof insertMetricsHistorySchema>;
export type MetricsHistory = typeof metricsHistory.$inferSelect;
export type InsertAlertSettings = z.infer<typeof insertAlertSettingsSchema>;
export type AlertSettings = typeof alertSettings.$inferSelect;
export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type AlertHistory = typeof alertHistory.$inferSelect;
export type InsertPromptTestRun = z.infer<typeof insertPromptTestRunSchema>;
export type PromptTestRun = typeof promptTestRuns.$inferSelect;
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type AgentTask = typeof agentTasks.$inferSelect;
export type InsertWorkflowRun = z.infer<typeof insertWorkflowRunSchema>;
export type WorkflowRun = typeof workflowRuns.$inferSelect;

// Community Engagement - Reddit, Quora, forums
export const communityPosts = pgTable(
  "community_posts",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    groupName: text("group_name").notNull(),
    groupUrl: text("group_url"),
    title: text("title"),
    content: text("content").notNull(),
    postUrl: text("post_url"),
    status: text("status").default("draft").notNull(),
    postType: text("post_type").default("answer"),
    keywords: text("keywords").array(),
    generatedByAi: integer("generated_by_ai").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    postedAt: timestamp("posted_at"),
  },
  (table) => [index("community_posts_brand_id_idx").on(table.brandId)],
);

export const insertCommunityPostSchema = createInsertSchema(communityPosts).omit({
  id: true,
  createdAt: true,
});

export type CommunityPost = typeof communityPosts.$inferSelect;
export type InsertCommunityPost = z.infer<typeof insertCommunityPostSchema>;

// ─── Email DLQ (Wave 3.6) ─────────────────────────────────────────
// After the retry helper exhausts its attempts, the failed send lands
// here so we can inspect / requeue / surface in admin UI. Migration in
// 0020_email_status_and_failures.sql.
export const emailFailures = pgTable(
  "email_failures",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id"),
    template: text("template").notNull(),
    toAddress: text("to_address").notNull(),
    payloadJsonb: jsonb("payload_jsonb"),
    lastError: text("last_error"),
    retryCount: integer("retry_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("email_failures_created_idx").on(table.createdAt)],
);

export type EmailFailure = typeof emailFailures.$inferSelect;
export type InsertEmailFailure = typeof emailFailures.$inferInsert;

// ─── API cost tracking (Wave 3.2) ─────────────────────────────────
// Records every outbound LLM call so we can enforce per-user, per-tier
// daily/monthly token budgets. Migration in 0019_api_costs.sql.
export const apiCosts = pgTable(
  "api_costs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    service: text("service").notNull(),
    model: text("model"),
    tokensIn: integer("tokens_in").default(0).notNull(),
    tokensOut: integer("tokens_out").default(0).notNull(),
    estCostCents: integer("est_cost_cents").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("api_costs_user_created_idx").on(table.userId, table.createdAt)],
);

export type ApiCost = typeof apiCosts.$inferSelect;
export type InsertApiCost = typeof apiCosts.$inferInsert;

// ─── Audit log (Wave 2.1) ─────────────────────────────────────────
// Sensitive operations (delete, subscription change, admin action) write
// a row here via server/lib/audit.ts. Migration in 0017_audit_logs.sql.
// user_id is ON DELETE SET NULL — log rows survive account deletion.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeJsonb: jsonb("before_jsonb"),
    afterJsonb: jsonb("after_jsonb"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_user_idx").on(table.userId, table.createdAt),
    index("audit_logs_action_idx").on(table.action, table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Notification preferences (Wave 6.8) ──────────────────────────
// One row per (user, notification type). Missing row == enabled
// (the default). Non-dismissable categories (billing, security) are
// never persisted here; they're hardcoded at send sites. Migration
// in 0025_notification_preferences.sql.
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: varchar("user_id").notNull(),
    type: text("type").notNull(),
    emailEnabled: boolean("email_enabled").default(true).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.type] }),
    index("notification_preferences_user_idx").on(table.userId),
  ],
);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;

// ─── Schema audits ────────────────────────────────────────────────
// Cache of structured-data (JSON-LD / schema.org) audits for a given
// URL. Keyed by `urlHash` = sha256(url).slice(0,32) so we can dedupe
// + look up without indexing full URLs. Migration in
// 0030_schema_audits_and_article_version.sql.
export const schemaAudits = pgTable(
  "schema_audits",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    urlHash: text("url_hash").notNull(),
    url: text("url").notNull(),
    // Full audit result payload (detected schemas, raw JSON-LD, etc).
    schemas: jsonb("schemas").notNull(),
    // Flat list of extra schema.org @types discovered on the page.
    additionalTypes: text("additional_types").array(),
    // Per-type completeness scores, e.g. { Article: 0.75, FAQPage: 0.4 }.
    completenessByType: jsonb("completeness_by_type"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("schema_audits_url_hash_idx").on(table.urlHash)],
);

export const insertSchemaAuditSchema = createInsertSchema(schemaAudits).omit({
  id: true,
  fetchedAt: true,
});
export type SchemaAudit = typeof schemaAudits.$inferSelect;
export type InsertSchemaAudit = z.infer<typeof insertSchemaAuditSchema>;

export const competitorFavicons = pgTable(
  "competitor_favicons",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    domain: text("domain").notNull(),
    iconUrl: text("icon_url"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("competitor_favicons_domain_idx").on(table.domain)],
);

export const insertCompetitorFaviconSchema = createInsertSchema(competitorFavicons).omit({
  id: true,
  fetchedAt: true,
});
export type CompetitorFavicon = typeof competitorFavicons.$inferSelect;
export type InsertCompetitorFavicon = z.infer<typeof insertCompetitorFaviconSchema>;

export const chatbotThreads = pgTable(
  "chatbot_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    title: text("title").notNull().default("New chat"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    userUpdatedIdx: index("chatbot_threads_user_updated_idx").on(t.userId, t.updatedAt.desc()),
  }),
);

export const chatbotMessages = pgTable(
  "chatbot_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatbotThreads.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index("chatbot_messages_user_created_idx").on(t.userId, t.createdAt.desc()),
    threadCreatedIdx: index("chatbot_messages_thread_created_idx").on(t.threadId, t.createdAt),
  }),
);

export const chatbotTokenUsage = pgTable(
  "chatbot_token_usage",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.usageDate] }),
  }),
);

export type ChatbotMessage = typeof chatbotMessages.$inferSelect;
export type InsertChatbotMessage = typeof chatbotMessages.$inferInsert;
export type ChatbotThread = typeof chatbotThreads.$inferSelect;
export type InsertChatbotThread = typeof chatbotThreads.$inferInsert;
export type ChatbotTokenUsage = typeof chatbotTokenUsage.$inferSelect;
export type InsertChatbotTokenUsage = typeof chatbotTokenUsage.$inferInsert;

// ─── Mentions rebuild (0050) ──────────────────────────────────────
// scan_jobs: tracks each manual or cron-triggered mention scan per brand.
// source_health: tracks per-(brand,source) consecutive failures + backoff.
// sentiment_cache: content-hash-keyed cache for gpt-4o-mini sentiment calls.
// See docs/superpowers/specs/2026-05-05-mentions-rebuild-design.md §3.2.

export const scanJobs = pgTable("scan_jobs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  brandId: varchar("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(), // 'manual' | 'cron'
  status: text("status").notNull().default("queued"), // 'queued' | 'running' | 'complete' | 'failed'
  perSource: jsonb("per_source").notNull().default({}),
  totals: jsonb("totals").notNull().default({}),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sourceHealth = pgTable(
  "source_health",
  {
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 'reddit' | 'hackernews' | 'quora'
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastFailureAt: timestamp("last_failure_at"),
    lastFailureReason: text("last_failure_reason"),
    pausedUntil: timestamp("paused_until"),
    lastSuccessfulScanAt: timestamp("last_successful_scan_at"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.brandId, t.source] }),
  }),
);

export const sentimentCache = pgTable("sentiment_cache", {
  contentHash: text("content_hash").primaryKey(),
  sentiment: text("sentiment").notNull(), // 'positive' | 'neutral' | 'negative'
  sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }).notNull(),
  cachedAt: timestamp("cached_at").notNull().defaultNow(),
});

export type ScanJob = typeof scanJobs.$inferSelect;
export type InsertScanJob = typeof scanJobs.$inferInsert;
export type SourceHealth = typeof sourceHealth.$inferSelect;
export type InsertSourceHealth = typeof sourceHealth.$inferInsert;
export type SentimentCache = typeof sentimentCache.$inferSelect;
export type InsertSentimentCache = typeof sentimentCache.$inferInsert;

export const tourEvents = pgTable("tour_events", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
  tourId: text("tour_id").notNull(),
  tourVersion: integer("tour_version").notNull(),
  stepId: text("step_id"),
  stepIndex: integer("step_index"),
  eventType: text("event_type").notNull(),
  triggerType: text("trigger_type"),
  dwellMs: integer("dwell_ms"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTourEventSchema = createInsertSchema(tourEvents).omit({
  serverReceivedAt: true,
});

export type TourEvent = typeof tourEvents.$inferSelect;
export type InsertTourEvent = z.infer<typeof insertTourEventSchema>;

// ── Plan 1 (v2): caching layer for search-grounded LLM ─────────────────
export const factScrapeCache = pgTable(
  "fact_scrape_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    source: text("source").notNull(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    valueJson: jsonb("value_json").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    index("fact_scrape_cache_brand_id_idx").on(table.brandId),
    index("fact_scrape_cache_expires_at_idx").on(table.expiresAt),
  ],
);
export type FactScrapeCache = typeof factScrapeCache.$inferSelect;
export type InsertFactScrapeCache = typeof factScrapeCache.$inferInsert;

// ── Plan 1 (v2): observability log per (run, source) ───────────────────
export const factScrapeLogs = pgTable(
  "fact_scrape_logs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: varchar("run_id")
      .notNull()
      .references(() => brandFactScrapeRuns.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    status: text("status").notNull(),
    factCount: integer("fact_count").notNull().default(0),
    latencyMs: integer("latency_ms"),
    providerLatencyMs: integer("provider_latency_ms"),
    errorKind: text("error_kind"),
    diagnostics: jsonb("diagnostics"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("fact_scrape_logs_run_id_idx").on(table.runId),
    index("fact_scrape_logs_created_at_idx").on(table.createdAt),
  ],
);
export type FactScrapeLog = typeof factScrapeLogs.$inferSelect;
export type InsertFactScrapeLog = typeof factScrapeLogs.$inferInsert;

// ── Plan 1 (v2): Postgres token bucket for LLM concurrency ─────────────
export const llmConcurrencySlots = pgTable(
  "llm_concurrency_slots",
  {
    slotId: text("slot_id").primaryKey(),
    provider: text("provider").notNull(),
    acquiredAt: timestamp("acquired_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    runId: varchar("run_id"),
  },
  (table) => [
    index("llm_concurrency_slots_provider_expires_idx").on(table.provider, table.expiresAt),
  ],
);
export type LlmConcurrencySlot = typeof llmConcurrencySlots.$inferSelect;

// ── Plan 1 (v2): generic JSON config store ─────────────────────────────
export const systemState = pgTable("system_state", {
  key: text("key").primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type SystemState = typeof systemState.$inferSelect;
